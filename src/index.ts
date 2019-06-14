import urljoin from 'url-join';
import got, { Response, GotJSONOptions, GotBodyOptions } from 'got';
import { Cookie } from 'tough-cookie';
import FormData from 'form-data';
import fs from 'fs';
import {
  TorrentSettings,
  TorrentClient,
  NormalizedTorrent,
  AllClientData,
  TorrentState,
  AddTorrentOptions as NormalizedAddTorrentOptions,
} from '@ctrl/shared-torrent';

import {
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
  Torrent,
  StringStatus,
  AddTorrentResponse,
} from './types';

const defaults: TorrentSettings = {
  baseUrl: 'http://localhost:8112/',
  path: '/json',
  password: 'deluge',
  timeout: 5000,
};

export class Deluge implements TorrentClient {
  config: TorrentSettings;

  private _msgId = 0;

  private _cookie?: Cookie;

  constructor(options: Partial<TorrentSettings> = {}) {
    this.config = { ...defaults, ...options };
  }

  resetSession() {
    this._cookie = undefined;
    this._msgId = 0;
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
   * Connects deluge and returns a list of available methods
   * @param host index of host to use in result of get hosts
   * @param hostIdx index of host to use in result of get hosts
   */
  async connect(selectedHost?: string, hostIdx = 0): Promise<ListMethods> {
    let host = selectedHost;
    if (!host) {
      const hosts = await this.getHosts();
      host = hosts.result[hostIdx][0];
    }

    if (!host) {
      throw new Error('No hosts found');
    }

    const res = await this.request<ListMethods>('web.connect', [host], true, false);
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
    const res = await this.request<StringStatus>('web.disconnect', [], true, false);
    // deluge 1.x returns a boolean and 2.x returns a string
    if (typeof res.body.result === 'boolean') {
      return res.body.result;
    }

    // "Connection was closed cleanly."
    return res.body.result.includes('closed cleanly');
  }

  /**
   * Checks current session is valid
   * @returns true if valid
   */
  async checkSession() {
    // cookie is missing or expires in x seconds
    if (this._cookie) {
      // eslint-disable-next-line new-cap
      if (this._cookie.TTL() < 5000) {
        this.resetSession();
        return false;
      }

      return true;
    }

    if (this._cookie) {
      try {
        const check = await this.request<BooleanStatus>('auth.check_session', undefined, false);
        if (check.body && check.body.result) {
          return true;
        }
        // tslint:disable-next-line:no-unused
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

    this._cookie = Cookie.parse(res.headers['set-cookie'][0]);
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

  async upload(torrent: string | Buffer): Promise<UploadResponse> {
    await this._validateAuth();
    const isConnected = await this.connected();
    if (!isConnected) {
      await this.connect();
    }

    const form = new FormData();
    if (typeof torrent === 'string') {
      if (fs.existsSync(torrent)) {
        form.append('file', Buffer.from(fs.readFileSync(torrent)));
      } else {
        form.append('file', Buffer.from(torrent, 'base64'));
      }
    } else {
      form.append('file', torrent);
    }

    const url = urljoin(this.config.baseUrl, '/upload');
    const options: GotBodyOptions<any> = {
      headers: form.getHeaders(),
      body: form,
      retry: 0,
    };
    // allow proxy agent
    if (this.config.agent) {
      options.agent = this.config.agent;
    }

    if (this.config.timeout) {
      options.timeout = this.config.timeout;
    }

    const res = await got.post(url, options);
    return JSON.parse(res.body);
  }

  async addTorrent(
    torrent: string | Buffer,
    config: Partial<AddTorrentOptions> = {},
  ): Promise<AddTorrentResponse> {
    const upload = await this.upload(torrent);
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
      pre_allocate_storage: false,
      move_completed: false,
      seed_mode: false,
      sequential_download: false,
      super_seeding: false,
      ...config,
    };
    const res = await this.request<AddTorrentResponse>('web.add_torrents', [[{ path, options }]]);

    if (res.body.result[0][0] === false) {
      throw new Error('Failed to add torrent');
    }

    return res.body;
  }

  async normalizedAddTorrent(
    torrent: string | Buffer,
    options: Partial<NormalizedAddTorrentOptions> = {},
  ): Promise<NormalizedTorrent> {
    const torrentOptions: Partial<AddTorrentOptions> = {};
    if (options.startPaused) {
      torrentOptions.add_paused = true;
    }

    if (!Buffer.isBuffer(torrent)) {
      torrent = Buffer.from(torrent);
    }

    const res = await this.addTorrent(torrent, torrentOptions);
    const torrentHash = res.result[0][1];

    if (options.label) {
      // sets the label but it might not set the label right away
      // sometimes takes a few seconds for label to reflect in results
      await this.setTorrentLabel(torrentHash, options.label);
    }

    return this.getTorrent(torrentHash);
  }

  async addTorrentMagnet(magnet: string, config: Partial<AddTorrentOptions> = {}) {
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
      move_completed: false,
      // move_completed_path: '/root/Downloads',
      pre_allocate_storage: false,
      seed_mode: false,
      sequential_download: false,
      super_seeding: false,
      ...config,
    };
    const res = await this.request<BooleanStatus>('core.add_torrent_magnet', [magnet, options]);

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
    this._cookie = Cookie.parse(res.headers['set-cookie'][0]);
    return res.body;
  }

  async getAllData(): Promise<AllClientData> {
    const listTorrents = await this.listTorrents();
    const results: AllClientData = {
      torrents: [],
      labels: [],
    };
    for (const id of Object.keys(listTorrents.result.torrents)) {
      const torrent = listTorrents.result.torrents[id];
      const torrentData: NormalizedTorrent = this._normalizeTorrentData(id, torrent);
      results.torrents.push(torrentData);
    }

    if (listTorrents.result.filters.label) {
      for (const label of listTorrents.result.filters.label) {
        results.labels.push({
          id: label[0],
          name: label[0],
          count: label[1],
        });
      }
    }

    return results;
  }

  async listTorrents(additionalFields: string[] = [], filter: { [key: string]: string } = {}) {
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
      // if they don't have the label plugin it shouldn't fail
      'label',
      ...additionalFields,
    ];
    const req = await this.request<TorrentListResponse>('web.update_ui', [
      [...new Set(fields)],
      filter,
    ]);
    return req.body;
  }

  async getTorrent(id: string) {
    const torrentResponse = await this.getTorrentStatus(id);
    return this._normalizeTorrentData(id, torrentResponse.result);
  }

  /**
   * get torrent state/status
   * @param additionalFields fields ex - `['label']`
   */
  async getTorrentStatus(
    torrentId: string,
    additionalFields: string[] = [],
  ): Promise<TorrentStatus> {
    const fields = [
      'total_done',
      'total_payload_download',
      'total_uploaded',
      'total_payload_upload',
      'next_announce',
      'tracker_status',
      'tracker',
      'comment',
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
      'total_size',
      'num_files',
      'total_done',
      'total_uploaded',
      'max_download_speed',
      'max_upload_speed',
      'seeds_peers_ratio',
      'label',
      ...additionalFields,
    ];
    const req = await this.request<TorrentStatus>('web.get_torrent_status', [torrentId, fields]);
    if (!req.body.result || !Object.keys(req.body.result).length) {
      throw new Error('Torrent not found');
    }

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

  async verifyTorrent(torrentId: string) {
    const req = await this.request<DefaultResponse>('core.force_recheck', [[torrentId]]);
    return req.body;
  }

  async setTorrentLabel(torrentId: string, label: string) {
    const req = await this.request<DefaultResponse>('label.set_torrent', [torrentId, label]);
    return req.body;
  }

  async addLabel(label: string) {
    const req = await this.request<DefaultResponse>('label.add', [label]);
    return req.body;
  }

  async getLabels() {
    const req = await this.request<ListMethods>('label.get_labels', []);
    return req.body;
  }

  async queueTop(torrentId: string) {
    const req = await this.request<DefaultResponse>('core.queue_top', [[torrentId]]);
    return req.body;
  }

  async queueBottom(torrentId: string) {
    const req = await this.request<DefaultResponse>('core.queue_bottom', [[torrentId]]);
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
    if (this._msgId === 4096) {
      this._msgId = 0;
    }

    if (needsAuth) {
      await this._validateAuth();
    }

    if (needsAuth && autoConnect) {
      const isConnected = await this.connected();
      if (!isConnected) {
        await this.connect();
      }
    }

    const headers: any = {
      Cookie: this._cookie && this._cookie.cookieString(),
    };
    const url = urljoin(this.config.baseUrl, this.config.path);
    const options: GotJSONOptions = {
      body: {
        method,
        params,
        id: this._msgId++,
      },
      headers,
      retry: 0,
      json: true,
    };

    // allow proxy agent
    if (this.config.agent) {
      options.agent = this.config.agent;
    }

    if (this.config.timeout) {
      options.timeout = this.config.timeout;
    }

    return got.post(url, options);
  }

  private _normalizeTorrentData(id: string, torrent: Torrent): NormalizedTorrent {
    const dateAdded = new Date(torrent.time_added * 1000).toISOString();

    // normalize state to enum
    let state = TorrentState.unknown;
    if (Object.keys(TorrentState).includes(torrent.state.toLowerCase())) {
      state = TorrentState[torrent.state.toLowerCase() as keyof typeof TorrentState];
    }

    const isCompleted = torrent.progress >= 100;

    const result: NormalizedTorrent = {
      id,
      name: torrent.name,
      state,
      isCompleted,
      stateMessage: torrent.state,
      progress: torrent.progress,
      ratio: torrent.ratio,
      dateAdded,
      dateCompleted: undefined,
      label: torrent.label,
      savePath: torrent.save_path,
      uploadSpeed: torrent.upload_payload_rate,
      downloadSpeed: torrent.download_payload_rate,
      eta: torrent.eta,
      queuePosition: torrent.queue + 1,
      connectedPeers: torrent.num_peers,
      connectedSeeds: torrent.num_seeds,
      totalPeers: torrent.total_peers,
      totalSeeds: torrent.total_seeds,
      totalSelected: torrent.total_wanted,
      totalSize: torrent.total_size,
      totalUploaded: torrent.total_uploaded,
      totalDownloaded: torrent.total_done,
    };
    return result;
  }

  private async _validateAuth() {
    let validAuth = await this.checkSession();
    if (!validAuth) {
      validAuth = await this.login();
    }

    if (!validAuth) {
      throw new Error('Invalid Auth');
    }
  }
}
