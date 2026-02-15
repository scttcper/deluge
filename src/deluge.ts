import { magnetDecode } from '@ctrl/magnet-link';
import type {
  AddTorrentOptions as NormalizedAddTorrentOptions,
  AllClientData,
  NormalizedTorrent,
  TorrentClient,
  TorrentClientConfig,
  TorrentClientState,
} from '@ctrl/shared-torrent';
import { FormData } from 'node-fetch-native';
import { ofetch } from 'ofetch';
import { Cookie } from 'tough-cookie';
import type { Jsonify } from 'type-fest';
import { joinURL } from 'ufo';
import { base64ToUint8Array, isUint8Array, stringToUint8Array } from 'uint8array-extras';

import { normalizeTorrentData } from './normalizeTorrentData.js';
import type {
  AddTorrentOptions,
  AddTorrentResponse,
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
  TorrentFiles,
  TorrentInfo,
  TorrentListResponse,
  TorrentOptions,
  TorrentStatus,
  Tracker,
  UploadResponse,
} from './types.js';

interface DelugeState extends TorrentClientState {
  auth: { cookie?: Cookie; msgId: number };
}

const defaults: TorrentClientConfig = {
  baseUrl: 'http://localhost:8112/',
  path: '/json',
  password: 'deluge',
  timeout: 5000,
};

export class Deluge implements TorrentClient {
  static createFromState(
    config: Readonly<TorrentClientConfig>,
    state: Readonly<Jsonify<DelugeState>>,
  ) {
    const deluge = new Deluge(config);
    deluge.state = {
      ...state,
      auth: state.auth
        ? {
            cookie: Cookie.fromJSON(state.auth.cookie),
            msgId: state.auth.msgId,
          }
        : { msgId: 0 },
    };
    return deluge;
  }

  config: TorrentClientConfig;
  state: DelugeState = { auth: { msgId: 0 } };

  constructor(options: Partial<TorrentClientConfig> = {}) {
    this.config = { ...defaults, ...options };
  }

  exportState(): Jsonify<DelugeState> {
    return JSON.parse(
      JSON.stringify({
        ...this.state,
        auth: this.state.auth
          ? {
              cookie: this.state.auth.cookie.toJSON(),
              msgId: this.state.auth.msgId,
            }
          : { msgId: 0 },
      }),
    );
  }

  resetSession(): void {
    this.state.auth = { msgId: 0 };
  }

  async getHosts(): Promise<GetHostsResponse> {
    const res = await this.request<GetHostsResponse>('web.get_hosts', [], true, false);
    return res._data;
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
    return res._data;
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
    return res._data;
  }

  async connected(): Promise<boolean> {
    const res = await this.request<BooleanStatus>('web.connected', [], true, false);
    return res._data.result;
  }

  /**
   * Disconnects deluge - warning all instances connected to this client will also be disconnected.
   * Other instances may also reconnect. Not really sure why you would want to disconnect
   */
  async disconnect(): Promise<boolean> {
    const res = await this.request<StringStatus>('web.disconnect', [], true, false);
    const body = res._data;
    // deluge 1.x returns a boolean and 2.x returns a string
    if (typeof body.result === 'boolean') {
      return body.result;
    }

    // "Connection was closed cleanly."
    return body.result.includes('closed cleanly');
  }

  /**
   * Checks current session is valid
   * @returns true if valid
   */
  async checkSession(): Promise<boolean> {
    // cookie is missing or expires in x seconds
    if (this.state.auth.cookie) {
      if (this.state.auth.cookie.TTL() < 5000) {
        this.resetSession();
        return false;
      }

      return true;
    }

    if (this.state.auth.cookie) {
      try {
        const check = await this.request<BooleanStatus>('auth.check_session', undefined, false);
        const body = await check.json();
        if (body?.result) {
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
    if (!res.ok || !res.headers?.get('set-cookie')?.length) {
      throw new Error('Auth failed, incorrect password');
    }

    this.state.auth.cookie = Cookie.parse(res.headers.get('set-cookie'));
    return true;
  }

  /**
   * Logout deluge
   * @returns true if success
   */
  async logout(): Promise<boolean> {
    const res = await this.request<BooleanStatus>('auth.delete_session');
    const body = res._data;
    this.resetSession();
    return body.result;
  }

  /**
   * returns the version ex - `2.0.3-2-201906121747-ubuntu18.04.1`
   */
  async getVersion(): Promise<StringStatus> {
    const req = await this.request<StringStatus>('daemon.get_version');
    return req._data;
  }

  /**
   * used to get torrent info before adding
   * @param tmpPath use path returned from upload torrent looks like `'/tmp/delugeweb-DfEsgR/tmpD3rujY.torrent'`
   */
  async getTorrentInfo(tmpPath: string): Promise<TorrentInfo> {
    const res = await this.request<TorrentInfo>('web.get_torrent_info', [tmpPath]);
    return res._data;
  }

  /**
   * Lists methods
   * @param auth disable or enable auth connection
   * @returns a list of method names
   */
  async listMethods(auth = true): Promise<ListMethods> {
    const req = await this.request<ListMethods>('system.listMethods', undefined, auth);
    return req._data;
  }

  async upload(torrent: string | Uint8Array<ArrayBuffer>): Promise<UploadResponse> {
    await this._validateAuth();
    const isConnected = await this.connected();
    if (!isConnected) {
      await this.connect();
    }

    const form = new FormData();
    const type = { type: 'application/x-bittorrent' };
    if (typeof torrent === 'string') {
      form.set('file', new File([base64ToUint8Array(torrent)], 'file.torrent', type));
    } else {
      const file = new File([torrent], 'torrent', type);
      form.set('file', file);
    }

    const url = joinURL(this.config.baseUrl, '/upload');
    const res = await ofetch<UploadResponse>(url, {
      method: 'POST',
      body: form,
      retry: 0,
      timeout: this.config.timeout,
      parseResponse: JSON.parse,
      dispatcher: this.config.dispatcher,
    });

    return res;
  }

  /**
   * Download a torrent from url, pass the result to {@link Deluge.addTorrent}
   * @param url
   * @param cookies
   * @returns file path
   */
  async downloadFromUrl(url: string, cookies = ''): Promise<string> {
    const res = await this.request<StringStatus>('web.download_torrent_from_url', [url, cookies]);
    const body = res._data;

    if (!body.result) {
      throw new Error('Failed to download torrent');
    }

    return body.result;
  }

  async addTorrent(
    torrent: string | Uint8Array<ArrayBuffer>,
    config: Partial<AddTorrentOptions> = {},
  ): Promise<AddTorrentResponse> {
    let path: string;
    const isUploaded = typeof torrent === 'string' && torrent.includes('delugeweb-');
    if (isUint8Array(torrent) || !isUploaded) {
      const upload = await this.upload(torrent);
      if (!upload.success || upload.files.length === 0) {
        throw new Error('Failed to upload');
      }

      path = upload.files[0];
    } else {
      /**
       * Assume paths starting with /tmp/ are from {@link Deluge.upload}
       * Example temp path: /run/deluged-temp/delugeweb-s0jy917j/ubuntu-20.10-desktop-amd64.iso.torrent
       */
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
    const body = res._data;

    if (!body.result) {
      throw new Error('Failed to add torrent');
    }

    return body;
  }

  async normalizedAddTorrent(
    torrent: string | Uint8Array<ArrayBuffer>,
    options: Partial<NormalizedAddTorrentOptions> = {},
  ): Promise<NormalizedTorrent> {
    const torrentOptions: Partial<AddTorrentOptions> = {};
    if (options.startPaused) {
      torrentOptions.add_paused = true;
    }

    let torrentHash: string | undefined;
    if (typeof torrent === 'string' && torrent.startsWith('magnet:')) {
      torrentHash = magnetDecode(torrent).infoHash;
      if (!torrentHash) {
        throw new Error('Magnet did not contain hash');
      }

      await this.addTorrentMagnet(torrent, torrentOptions);
    } else {
      if (!isUint8Array(torrent)) {
        torrent = stringToUint8Array(torrent);
      }

      const res = await this.addTorrent(torrent, torrentOptions);
      torrentHash = res.result[0][1];
    }

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

    return res._data;
  }

  /**
   *
   * @param torrentId torrent id from list torrents
   * @param removeData (default: false) If true, remove the data from disk
   */
  async removeTorrent(torrentId: string, removeData = false): Promise<BooleanStatus> {
    const req = await this.request<BooleanStatus>('core.remove_torrent', [torrentId, removeData]);
    return req._data;
  }

  async changePassword(password: string): Promise<BooleanStatus> {
    const res = await this.request<BooleanStatus>('auth.change_password', [
      this.config.password,
      password,
    ]);
    const body = res._data;
    if (!body.result || !res.headers.get('set-cookie')?.length) {
      throw new Error('Old password incorrect');
    }

    // update current password to new password
    this.config.password = password;
    this.state.auth.cookie = Cookie.parse(res.headers.get('set-cookie'));
    return body;
  }

  async getAllData(): Promise<AllClientData> {
    const listTorrents = await this.listTorrents();
    const results: AllClientData = {
      torrents: [],
      labels: [],
      raw: listTorrents,
    };
    for (const id of Object.keys(listTorrents.result.torrents)) {
      const torrent = listTorrents.result.torrents[id];
      const torrentData: NormalizedTorrent = normalizeTorrentData(id, torrent);
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
    return req._data;
  }

  async getTorrent(id: string): Promise<NormalizedTorrent> {
    const torrentResponse = await this.getTorrentStatus(id);
    return normalizeTorrentData(id, torrentResponse.result);
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
    const body: TorrentStatus = req._data;
    if (!body.result || Object.keys(body.result).length === 0) {
      throw new Error('Torrent not found');
    }

    return body;
  }

  /**
   * Get list of files for a torrent
   */
  async getTorrentFiles(torrentId: string): Promise<TorrentFiles> {
    const req = await this.request<TorrentFiles>('web.get_torrent_files', [torrentId]);
    return req._data;
  }

  async pauseTorrent(torrentId: string): Promise<DefaultResponse> {
    const req = await this.request<DefaultResponse>('core.pause_torrent', [[torrentId]]);
    return req._data;
  }

  async resumeTorrent(torrentId: string): Promise<DefaultResponse> {
    const req = await this.request<DefaultResponse>('core.resume_torrent', [[torrentId]]);
    return req._data;
  }

  async setTorrentOptions(
    torrentId: string,
    options: Partial<TorrentOptions> = {},
  ): Promise<DefaultResponse> {
    const req = await this.request<DefaultResponse>('core.set_torrent_options', [
      [torrentId],
      options,
    ]);
    return req._data;
  }

  async setTorrentTrackers(torrentId: string, trackers: Tracker[] = []): Promise<DefaultResponse> {
    const req = await this.request<DefaultResponse>('core.set_torrent_trackers', [
      [torrentId],
      trackers,
    ]);
    return req._data;
  }

  async updateTorrentTrackers(torrentId: string): Promise<DefaultResponse> {
    const req = await this.request<DefaultResponse>('core.force_reannounce', [[torrentId]]);
    return req._data;
  }

  async verifyTorrent(torrentId: string): Promise<DefaultResponse> {
    const req = await this.request<DefaultResponse>('core.force_recheck', [[torrentId]]);
    return req._data;
  }

  async setTorrentLabel(torrentId: string, label: string): Promise<DefaultResponse> {
    const req = await this.request<DefaultResponse>('label.set_torrent', [torrentId, label]);
    return req._data;
  }

  async addLabel(label: string): Promise<DefaultResponse> {
    const req = await this.request<DefaultResponse>('label.add', [label]);
    return req._data;
  }

  async removeLabel(label: string): Promise<DefaultResponse> {
    const req = await this.request<DefaultResponse>('label.remove', [label]);
    return req._data;
  }

  async getLabels(): Promise<ListMethods> {
    const req = await this.request<ListMethods>('label.get_labels', []);
    return req._data;
  }

  async queueTop(torrentId: string): Promise<DefaultResponse> {
    const req = await this.request<DefaultResponse>('core.queue_top', [[torrentId]]);
    return req._data;
  }

  async queueBottom(torrentId: string): Promise<DefaultResponse> {
    const req = await this.request<DefaultResponse>('core.queue_bottom', [[torrentId]]);
    return req._data;
  }

  async queueUp(torrentId: string): Promise<DefaultResponse> {
    const req = await this.request<DefaultResponse>('core.queue_up', [[torrentId]]);
    return req._data;
  }

  async queueDown(torrentId: string): Promise<DefaultResponse> {
    const req = await this.request<DefaultResponse>('core.queue_down', [[torrentId]]);
    return req._data;
  }

  async getConfig(): Promise<ConfigResponse> {
    const req = await this.request<ConfigResponse>('core.get_config', []);
    return req._data;
  }

  async setConfig(config: Partial<DelugeSettings>): Promise<DefaultResponse> {
    const req = await this.request<DefaultResponse>('core.set_config', [config]);
    return req._data;
  }

  async getPlugins(): Promise<PluginsListResponse> {
    const req = await this.request<PluginsListResponse>('web.get_plugins', []);
    return req._data;
  }

  async getPluginInfo(plugins: string[]): Promise<PluginInfo> {
    const req = await this.request<PluginInfo>('web.get_plugin_info', plugins);
    return req._data;
  }

  async enablePlugin(plugins: string[]): Promise<DefaultResponse> {
    const req = await this.request<DefaultResponse>('core.enable_plugin', plugins);
    return req._data;
  }

  async disablePlugin(plugins: string[]): Promise<DefaultResponse> {
    const req = await this.request<DefaultResponse>('core.disable_plugin', plugins);
    return req._data;
  }

  async request<T extends object>(
    method: string,
    params: any[] = [],
    needsAuth = true,
    autoConnect = true,
  ): Promise<ReturnType<typeof ofetch.raw<T>>> {
    if (this.state.auth.msgId === 4096) {
      this.state.auth.msgId = 0;
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
      Cookie: this.state.auth.cookie?.cookieString?.(),
    };
    const url = joinURL(this.config.baseUrl, this.config.path);

    const res = await ofetch.raw<T>(url, {
      method: 'POST',
      body: JSON.stringify({
        method,
        params,
        id: this.state.auth.msgId++,
      }),
      headers,
      retry: 0,
      timeout: this.config.timeout,
      responseType: 'json',
      parseResponse: JSON.parse,
      dispatcher: this.config.dispatcher,
    });

    const err =
      (res.body as any as { error: unknown })?.error ?? (typeof res.body === 'string' && res.body);

    if (err) {
      throw new Error((err as Error).message || (err as string));
    }

    return res;
  }

  private async _validateAuth(): Promise<void> {
    let validAuth = await this.checkSession();
    validAuth ||= await this.login();

    if (!validAuth) {
      throw new Error('Invalid Auth');
    }
  }
}
