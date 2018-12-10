import { resolve } from 'url';
import got, { Response } from 'got';
import { Cookie } from 'tough-cookie';
import FormData from 'form-data';
import fs from 'fs';
import {
  DelugeConfig,
  GetHostsResponse,
  GetHostStatusResponse,
  DefaultResponse,
  BooleanStatus,
  TorrentInfo,
  ListMethods,
  UploadResponse,
  AddTorrentOptions,
  TorrentListResponse,
  DelugeSettings,
  PluginInfo,
  ConfigResponse,
  PluginsListResponse,
  TorrentOptions,
  TorrentFiles,
  TorrentStatus,
  Tracker,
} from './types';

const defaults: DelugeConfig = {
  baseURL: 'http://localhost:8112/',
  path: '/json',
  password: 'deluge',
};

export const TORRENT_STATUS_FIELDS = [
  'total_done',
  'total_payload_download',
  'total_uploaded',
  'total_payload_upload',
  'next_announce',
  'tracker_status',
  'num_pieces',
  'piece_length',
  'is_auto_managed',
  'active_time',
  'seeding_time',
  'seed_rank',
  'queue',
  'name',
  'total_wanted',
  'state',
  'progress',
  'num_seeds',
  'total_seeds',
  'num_peers',
  'total_peers',
  'download_payload_rate',
  'upload_payload_rate',
  'eta',
  'ratio',
  'distributed_copies',
  'is_auto_managed',
  'time_added',
  'tracker_host',
  'save_path',
  'total_done',
  'total_uploaded',
  'max_download_speed',
  'max_upload_speed',
  'seeds_peers_ratio',
];

export class Deluge {
  msgId = 0;
  cookie?: Cookie;
  config: DelugeConfig;

  constructor(options: Partial<DelugeConfig>) {
    this.config = { ...defaults, ...options };
  }

  resetSession() {
    this.cookie = undefined;
    this.msgId = 0;
  }

  async getHosts() {
    const res = await this.request<GetHostsResponse>('web.get_hosts', [], true, false);
    return res.body;
  }

  /**
   * Gets host status
   * @param host pass host id from `this.getHosts()`
   */
  async getHostStatus(host: string) {
    const res = await this.request<GetHostStatusResponse>(
      'web.get_host_status',
      [host],
      true,
      false,
    );
    return res.body;
  }

  /**
   * Connects deluge
   * @param [host] index of host to use in result of get hosts
   * @param [hostIdx] index of host to use in result of get hosts
   */
  async connect(selectedHost?: string, hostIdx = 0): Promise<DefaultResponse> {
    let host = selectedHost;
    if (!host) {
      const hosts = await this.getHosts();
      host = hosts.result[hostIdx][0];
    }
    if (!host) {
      throw new Error('No hosts found');
    }
    const res = await this.request<DefaultResponse>('web.connect', [host], true, false);
    return res.body;
  }

  async connected(): Promise<boolean> {
    const res = await this.request<BooleanStatus>('web.connected', [], true, false);
    return res.body.result;
  }

  /**
   * Disconnects deluge - warning all instances connected to this client will also be disconnected.
   * Other instances may also reconnect. Not really sure why you would want to disconnect
   */
  async disconnect(): Promise<boolean> {
    const res = await this.request<BooleanStatus>('web.disconnect', [], true, false);
    return res.body.result;
  }

  /**
   * Checks current session is valid
   * @returns true if valid
   */
  async checkSession() {
    // cookie is missing or expires in x seconds
    if (this.cookie) {
      if (this.cookie.TTL() < 5000) {
        this.resetSession();
        return false;
      }
      return true;
    }
    if (this.cookie) {
      try {
        const check = await this.request<BooleanStatus>('auth.check_session', undefined, false);
        if (check.body && check.body.result) {
          return true;
        }
      } catch {
        // do nothing
      }
    }
    this.resetSession();
    return false;
  }

  /**
   * Login deluge
   * @returns true if success
   */
  async login(): Promise<boolean> {
    this.resetSession();
    const res = await this.request<BooleanStatus>('auth.login', [this.config.password], false);
    if (!res.body.result || !res.headers || !res.headers['set-cookie']) {
      throw new Error('Auth failed, incorrect password');
    }
    this.cookie = Cookie.parse(res.headers['set-cookie'][0]);
    return true;
  }

  /**
   * Logout deluge
   * @returns true if success
   */
  async logout(): Promise<boolean> {
    const res = await this.request<BooleanStatus>('auth.delete_session');
    this.resetSession();
    return res.body.result;
  }

  /**
   * used to get torrent info before adding
   * @param tmpPath use path returned from upload torrent looks like `'/tmp/delugeweb-DfEsgR/tmpD3rujY.torrent'`
   */
  async getTorrentInfo(tmpPath: string) {
    const res = await this.request<TorrentInfo>('web.get_torrent_info', [tmpPath]);
    return res.body;
  }

  /**
   * Lists methods
   * @returns a list of method names
   */
  async listMethods() {
    const req = await this.request<ListMethods>('system.listMethods', undefined, false);
    return req.body;
  }

  async upload(filePath: string): Promise<UploadResponse> {
    await this.validateAuth();
    const isConnected = await this.connected();
    if (!isConnected) {
      await this.connect();
    }

    const f = fs.createReadStream(filePath);
    const form = new FormData();
    form.append('file', f);

    const url = resolve(this.config.baseURL, 'upload');
    const res = await got.post(url, {
      headers: form.getHeaders(),
      body: form,
    });
    return JSON.parse(res.body);
  }

  async addTorrent(filePath: string, config: Partial<AddTorrentOptions> = {}) {
    const upload = await this.upload(filePath);
    if (!upload.success || !upload.files.length) {
      throw new Error('Failed to upload');
    }

    const path = upload.files[0];
    const options: AddTorrentOptions = {
      file_priorities: [],
      add_paused: false,
      compact_allocation: false,
      max_connections: -1,
      max_download_speed: -1,
      max_upload_slots: -1,
      max_upload_speed: -1,
      prioritize_first_last_pieces: false,
      // not passing path by default uses default
      // download_location: '/root/Downloads',
      // move_completed_path: '/root/Downloads',
      ...config,
    };
    const res = await this.request<BooleanStatus>('web.add_torrents', [
      [
        {
          path,
          options,
        },
      ],
    ]);
    return res.body;
  }

  /**
   *
   * @param torrentId torrent id from list torrents
   * @param removeData true will delete all data from disk
   */
  async removeTorrent(torrentId: string, removeData = true) {
    const req = await this.request<BooleanStatus>('core.remove_torrent', [torrentId, removeData]);
    return req.body;
  }

  async changePassword(password: string) {
    const res = await this.request<BooleanStatus>('auth.change_password', [
      this.config.password,
      password,
    ]);
    if (!res.body.result || !res.headers || !res.headers['set-cookie']) {
      throw new Error('Old password incorrect');
    }
    // update current password to new password
    this.config.password = password;
    this.cookie = Cookie.parse(res.headers['set-cookie'][0]);
    return res.body;
  }

  async listTorrents(additionalFields: string[] = []) {
    const fields = [
      'distributed_copies',
      'download_payload_rate',
      'eta',
      'is_auto_managed',
      'max_download_speed',
      'max_upload_speed',
      'name',
      'num_peers',
      'num_seeds',
      'progress',
      'queue',
      'ratio',
      'save_path',
      'seeds_peers_ratio',
      'state',
      'time_added',
      'total_done',
      'total_peers',
      'total_seeds',
      'total_uploaded',
      'total_wanted',
      'tracker_host',
      'upload_payload_rate',
      ...additionalFields,
    ];
    const req = await this.request<TorrentListResponse>('web.update_ui', [
      [...new Set(fields)],
      {},
    ]);
    return req.body;
  }

  /**
   * get torrent state/status
   * @param fields fields ex - `['peers']`
   */
  async getTorrentStatus(torrentId: string, fields: string[] = TORRENT_STATUS_FIELDS) {
    const req = await this.request<TorrentStatus>('web.get_torrent_status', [torrentId, fields]);
    return req.body;
  }

  /**
   * Get list of files for a torrent
   */
  async getTorrentFiles(torrentId: string) {
    const req = await this.request<TorrentFiles>('web.get_torrent_files', [torrentId]);
    return req.body;
  }

  async pauseTorrent(torrentId: string) {
    const req = await this.request<DefaultResponse>('core.pause_torrent', [[torrentId]]);
    return req.body;
  }

  async resumeTorrent(torrentId: string) {
    const req = await this.request<DefaultResponse>('core.resume_torrent', [[torrentId]]);
    return req.body;
  }

  async setTorrentOptions(torrentId: string, options: Partial<TorrentOptions> = {}) {
    const req = await this.request<DefaultResponse>('core.set_torrent_options', [
      [torrentId],
      options,
    ]);
    return req.body;
  }

  async setTorrentTrackers(torrentId: string, trackers: Tracker[] = []) {
    const req = await this.request<DefaultResponse>('core.set_torrent_trackers', [
      [torrentId],
      trackers,
    ]);
    return req.body;
  }

  async queueUp(torrentId: string) {
    const req = await this.request<DefaultResponse>('core.queue_up', [[torrentId]]);
    return req.body;
  }

  async queueDown(torrentId: string) {
    const req = await this.request<DefaultResponse>('core.queue_down', [[torrentId]]);
    return req.body;
  }

  async getConfig() {
    const req = await this.request<ConfigResponse>('core.get_config', []);
    return req.body;
  }

  async setConfig(config: Partial<DelugeSettings>) {
    const req = await this.request<DefaultResponse>('core.set_config', [config]);
    return req.body;
  }

  async getPlugins() {
    const req = await this.request<PluginsListResponse>('web.get_plugins', []);
    return req.body;
  }

  async getPluginInfo(plugins: string[]) {
    const req = await this.request<PluginInfo>('web.get_plugin_info', plugins);
    return req.body;
  }

  async enablePlugin(plugins: string[]) {
    const req = await this.request<DefaultResponse>('core.enable_plugin', plugins);
    return req.body;
  }

  async disablePlugin(plugins: string[]) {
    const req = await this.request<DefaultResponse>('core.disable_plugin', plugins);
    return req.body;
  }

  async request<T extends object>(
    method: string,
    params: any[] = [],
    needsAuth = true,
    autoConnect = true,
  ): Promise<Response<T>> {
    if (this.msgId === 4096) {
      this.msgId = 0;
    }
    if (needsAuth) {
      await this.validateAuth();
    }
    if (needsAuth && autoConnect) {
      const isConnected = await this.connected();
      if (!isConnected) {
        await this.connect();
      }
    }
    const headers: any = {
      Cookie: this.cookie && this.cookie.cookieString(),
    };
    const url = resolve(this.config.baseURL, this.config.path);
    return got.post(url, {
      json: true,
      body: {
        method,
        params,
        id: this.msgId++,
      },
      headers,
    });
  }

  private async validateAuth() {
    let validAuth = await this.checkSession();
    if (!validAuth) {
      validAuth = await this.login();
    }
    if (!validAuth) {
      throw new Error('Invalid Auth');
    }
  }
}
