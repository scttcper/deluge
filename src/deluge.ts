import { existsSync, readFileSync } from 'fs';

import FormData from 'form-data';
import got, { Response } from 'got';
import { Cookie } from 'tough-cookie';
import { urlJoin } from '@ctrl/url-join';
import {
  AddTorrentOptions as NormalizedAddTorrentOptions,
  AllClientData,
  NormalizedTorrent,
  TorrentClient,
  TorrentSettings,
  TorrentState,
} from '@ctrl/shared-torrent';

import {
  AddTorrentOptions,
  BooleanStatus,
  ConfigResponse,
  DefaultResponse,
  DelugeSettings,
  GetHostsResponse,
  GetHostStatusResponse,
  ListMethods,
  PluginInfo,
  PluginsListResponse,
  StringStatus,
  Torrent,
  TorrentFiles,
  TorrentInfo,
  TorrentListResponse,
  TorrentOptions,
  TorrentStatus,
  Tracker,
  UploadResponse,
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

  resetSession(): void {
    this._cookie = undefined;
    this._msgId = 0;
  }

  async getHosts(): Promise<GetHostsResponse> {
    const res = await this.request<GetHostsResponse>('web.get_hosts', [], true, false);
    return res.body;
  }

  /**
   * Gets host status
   * @param host pass host id from `this.getHosts()`
   */
  async getHostStatus(host: string): Promise<GetHostStatusResponse> {
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
  async checkSession(): Promise<boolean> {
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
        if (check?.body?.result) {
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
   * returns the version ex - `2.0.3-2-201906121747-ubuntu18.04.1`
   */
  async getVersion(): Promise<StringStatus> {
    const req = await this.request<StringStatus>('daemon.get_version');
    return req.body;
  }

  /**
   * used to get torrent info before adding
   * @param tmpPath use path returned from upload torrent looks like `'/tmp/delugeweb-DfEsgR/tmpD3rujY.torrent'`
   */
  async getTorrentInfo(tmpPath: string): Promise<TorrentInfo> {
    const res = await this.request<TorrentInfo>('web.get_torrent_info', [tmpPath]);
    return res.body;
  }

  /**
   * Lists methods
   * @param auth disable or enable auth connection
   * @returns a list of method names
   */
  async listMethods(auth = true): Promise<ListMethods> {
    const req = await this.request<ListMethods>('system.listMethods', undefined, auth);
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
      if (existsSync(torrent)) {
        form.append('file', Buffer.from(readFileSync(torrent)), 'temp.torrent');
      } else {
        form.append('file', Buffer.from(torrent, 'base64'), 'temp.torrent');
      }
    } else {
      form.append('file', torrent, 'temp.torrent');
    }

    const url = urlJoin(this.config.baseUrl, '/upload');
    const res = await got.post(url, {
      headers: form.getHeaders(),
      body: form,
      retry: 0,
      // allow proxy agent
      agent: this.config.agent,
      timeout: this.config.timeout,
    });

    // repsonse is json but in a string, cannot use native got.json()
    return JSON.parse(res.body) as UploadResponse;
  }

  /**
   * Download a torrent from url, pass the result to {@link Deluge.addTorrent}
   * @param url
   * @param cookies
   * @returns file path
   */
  async downloadFromUrl(url: string, cookies = ''): Promise<string> {
    const res = await this.request<StringStatus>('web.download_torrent_from_url', [url, cookies]);

    if (!res.body.result) {
      throw new Error('Failed to download torrent');
    }

    return res.body.result;
  }

  async addTorrent(
    torrent: string | Buffer,
    config: Partial<AddTorrentOptions> = {},
  ): Promise<AddTorrentResponse> {
    let path: string;
    if (Buffer.isBuffer(torrent) || !torrent.startsWith('/tmp/')) {
      const upload = await this.upload(torrent);
      if (!upload.success || !upload.files.length) {
        throw new Error('Failed to upload');
      }

      path = upload.files[0];
    } else {
      /** Assume paths starting with /tmp/ are from {@link Deluge.addTorrent} */
      path = torrent;
    }

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

    if (!res.body.result) {
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

  async addTorrentMagnet(
    magnet: string,
    config: Partial<AddTorrentOptions> = {},
  ): Promise<BooleanStatus> {
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
  async removeTorrent(torrentId: string, removeData = true): Promise<BooleanStatus> {
    const req = await this.request<BooleanStatus>('core.remove_torrent', [torrentId, removeData]);
    return req.body;
  }

  async changePassword(password: string): Promise<BooleanStatus> {
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

  async listTorrents(
    additionalFields: string[] = [],
    filter: Record<string, string> = {},
  ): Promise<TorrentListResponse> {
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

  async getTorrent(id: string): Promise<NormalizedTorrent> {
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
  async getTorrentFiles(torrentId: string): Promise<TorrentFiles> {
    const req = await this.request<TorrentFiles>('web.get_torrent_files', [torrentId]);
    return req.body;
  }

  async pauseTorrent(torrentId: string): Promise<DefaultResponse> {
    const req = await this.request<DefaultResponse>('core.pause_torrent', [[torrentId]]);
    return req.body;
  }

  async resumeTorrent(torrentId: string): Promise<DefaultResponse> {
    const req = await this.request<DefaultResponse>('core.resume_torrent', [[torrentId]]);
    return req.body;
  }

  async setTorrentOptions(
    torrentId: string,
    options: Partial<TorrentOptions> = {},
  ): Promise<DefaultResponse> {
    const req = await this.request<DefaultResponse>('core.set_torrent_options', [
      [torrentId],
      options,
    ]);
    return req.body;
  }

  async setTorrentTrackers(torrentId: string, trackers: Tracker[] = []): Promise<DefaultResponse> {
    const req = await this.request<DefaultResponse>('core.set_torrent_trackers', [
      [torrentId],
      trackers,
    ]);
    return req.body;
  }

  async updateTorrentTrackers(torrentId: string): Promise<DefaultResponse> {
    const req = await this.request<DefaultResponse>('core.force_reannounce', [[torrentId]]);
    return req.body;
  }

  async verifyTorrent(torrentId: string): Promise<DefaultResponse> {
    const req = await this.request<DefaultResponse>('core.force_recheck', [[torrentId]]);
    return req.body;
  }

  async setTorrentLabel(torrentId: string, label: string): Promise<DefaultResponse> {
    const req = await this.request<DefaultResponse>('label.set_torrent', [torrentId, label]);
    return req.body;
  }

  async addLabel(label: string): Promise<DefaultResponse> {
    const req = await this.request<DefaultResponse>('label.add', [label]);
    return req.body;
  }

  async removeLabel(label: string): Promise<DefaultResponse> {
    const req = await this.request<DefaultResponse>('label.remove', [label]);
    return req.body;
  }

  async getLabels(): Promise<ListMethods> {
    const req = await this.request<ListMethods>('label.get_labels', []);
    return req.body;
  }

  async queueTop(torrentId: string): Promise<DefaultResponse> {
    const req = await this.request<DefaultResponse>('core.queue_top', [[torrentId]]);
    return req.body;
  }

  async queueBottom(torrentId: string): Promise<DefaultResponse> {
    const req = await this.request<DefaultResponse>('core.queue_bottom', [[torrentId]]);
    return req.body;
  }

  async queueUp(torrentId: string): Promise<DefaultResponse> {
    const req = await this.request<DefaultResponse>('core.queue_up', [[torrentId]]);
    return req.body;
  }

  async queueDown(torrentId: string): Promise<DefaultResponse> {
    const req = await this.request<DefaultResponse>('core.queue_down', [[torrentId]]);
    return req.body;
  }

  async getConfig(): Promise<ConfigResponse> {
    const req = await this.request<ConfigResponse>('core.get_config', []);
    return req.body;
  }

  async setConfig(config: Partial<DelugeSettings>): Promise<DefaultResponse> {
    const req = await this.request<DefaultResponse>('core.set_config', [config]);
    return req.body;
  }

  async getPlugins(): Promise<PluginsListResponse> {
    const req = await this.request<PluginsListResponse>('web.get_plugins', []);
    return req.body;
  }

  async getPluginInfo(plugins: string[]): Promise<PluginInfo> {
    const req = await this.request<PluginInfo>('web.get_plugin_info', plugins);
    return req.body;
  }

  async enablePlugin(plugins: string[]): Promise<DefaultResponse> {
    const req = await this.request<DefaultResponse>('core.enable_plugin', plugins);
    return req.body;
  }

  async disablePlugin(plugins: string[]): Promise<DefaultResponse> {
    const req = await this.request<DefaultResponse>('core.disable_plugin', plugins);
    return req.body;
  }

  // eslint-disable-next-line @typescript-eslint/ban-types
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
      Cookie: this._cookie?.cookieString?.(),
    };
    const url = urlJoin(this.config.baseUrl, this.config.path);
    const res: Response<T> = await got.post(url, {
      json: {
        method,
        params,
        id: this._msgId++,
      },
      headers,
      retry: 0,
      // allow proxy agent
      agent: this.config.agent,
      timeout: this.config.timeout,
      responseType: 'json',
    });

    const err =
      (res.body as { error: unknown })?.error ?? (typeof res.body === 'string' && res.body);

    if (err) {
      throw new Error((err as Error).message || (err as string));
    }

    return res;
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

  private async _validateAuth(): Promise<void> {
    let validAuth = await this.checkSession();
    if (!validAuth) {
      validAuth = await this.login();
    }

    if (!validAuth) {
      throw new Error('Invalid Auth');
    }
  }
}
