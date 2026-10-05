import { magnetDecode } from '@ctrl/magnet-link';
import {
  type AddTorrentOptions as NormalizedAddTorrentOptions,
  type AllClientData,
  type NormalizedTorrent,
  type TorrentClient,
  type TorrentClientConfig,
  TorrentClientError,
  type TorrentClientErrorCode,
  type TorrentClientState,
} from '@ctrl/shared-torrent';
import { parseSetCookie, splitSetCookieString, stringifyCookie } from 'cookie-es';
import { FormData } from 'node-fetch-native';
import { FetchError, ofetch } from 'ofetch';
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
  MagnetInfoResponse,
  NumberStatus,
  PluginInfo,
  PluginsListResponse,
  RemoveTorrentsResponse,
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
  auth: { cookieHeader?: string; expires?: string; msgId: number };
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
            cookieHeader: state.auth.cookieHeader,
            expires: state.auth.expires ? new Date(state.auth.expires).toISOString() : undefined,
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
        auth: this.state.auth,
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
      throw new TorrentClientError('No hosts found', 'client_error');
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
    if (!this.state.auth.cookieHeader) {
      this.resetSession();
      return false;
    }

    const expires = this.state.auth.expires ? new Date(this.state.auth.expires) : undefined;
    if (expires && expires.getTime() - Date.now() < 5000) {
      this.resetSession();
      return false;
    }

    try {
      const check = await this.request<BooleanStatus>('auth.check_session', undefined, false);
      const body = check._data;
      if (body?.result) {
        return true;
      }
    } catch {
      // do nothing
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
      throw new TorrentClientError('Auth failed, incorrect password', 'unauthorized');
    }

    this._setAuthCookie(res.headers.get('set-cookie'));
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
      throw new TorrentClientError('Failed to download torrent', 'client_error');
    }

    return body.result;
  }

  /**
   * @param options anything left out uses the daemon's core.conf defaults
   */
  async addTorrent(
    torrent: string | Uint8Array<ArrayBuffer>,
    options: Partial<AddTorrentOptions> = {},
  ): Promise<AddTorrentResponse> {
    let path: string;
    const isUploaded = typeof torrent === 'string' && torrent.includes('delugeweb-');
    if (isUint8Array(torrent) || !isUploaded) {
      const upload = await this.upload(torrent);
      if (!upload.success || upload.files.length === 0) {
        throw new TorrentClientError('Failed to upload', 'client_error');
      }

      path = upload.files[0];
    } else {
      /**
       * Assume paths starting with /tmp/ are from {@link Deluge.upload}
       * Example temp path: /run/deluged-temp/delugeweb-s0jy917j/ubuntu-20.10-desktop-amd64.iso.torrent
       */
      path = torrent;
    }

    const res = await this.request<AddTorrentResponse>('web.add_torrents', [
      [{ path, options: legacyTorrentOptions(options) }],
    ]);
    const body = res._data;

    if (!body.result) {
      throw new TorrentClientError('Failed to add torrent', 'client_error');
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

  /**
   * @param options anything left out uses the daemon's core.conf defaults
   * @returns the torrent id
   */
  async addTorrentMagnet(
    magnet: string,
    options: Partial<AddTorrentOptions> = {},
  ): Promise<StringStatus> {
    const res = await this.request<StringStatus>('core.add_torrent_magnet', [
      magnet,
      legacyTorrentOptions(options),
    ]);
    return res._data;
  }

  /**
   * @param torrentId one or more torrent ids from list torrents
   * @param removeData (default: false) If true, remove the data from disk
   * @throws when a torrent doesn't exist
   */
  async removeTorrent(torrentId: string | string[], removeData = false): Promise<void> {
    if (!Array.isArray(torrentId)) {
      await this.request<BooleanStatus>('core.remove_torrent', [torrentId, removeData]);
      return;
    }

    const res = await this.removeTorrents(torrentId, removeData);
    if (res.result.length > 0) {
      throw new TorrentClientError(
        res.result.map(([, message]) => message).join(', '),
        res.result.every(([, message]) => message.endsWith('not in session.'))
          ? 'torrent_not_found'
          : 'client_error',
      );
    }
  }

  /**
   * @param removeData (default: false) If true, remove the data from disk
   */
  async removeTorrents(torrentIds: string[], removeData = false): Promise<RemoveTorrentsResponse> {
    const req = await this.request<RemoveTorrentsResponse>('core.remove_torrents', [
      torrentIds,
      removeData,
    ]);
    return req._data;
  }

  async changePassword(password: string): Promise<BooleanStatus> {
    const res = await this.request<BooleanStatus>('auth.change_password', [
      this.config.password,
      password,
    ]);
    const body = res._data;
    if (!body.result || !res.headers.get('set-cookie')?.length) {
      throw new TorrentClientError('Old password incorrect', 'unauthorized');
    }

    // update current password to new password
    this.config.password = password;
    this._setAuthCookie(res.headers.get('set-cookie'));
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
        // skip the `All` pseudo filter and the no label bucket
        if (label[0] === 'All' || label[0] === '') {
          continue;
        }

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
      'completed_time',
      'distributed_copies',
      'download_payload_rate',
      'eta',
      'is_auto_managed',
      'is_finished',
      'max_download_speed',
      'max_upload_speed',
      'message',
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
      'total_size',
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
      'is_finished',
      'completed_time',
      'message',
      'label',
      ...additionalFields,
    ];
    const req = await this.request<TorrentStatus>('web.get_torrent_status', [torrentId, fields]);
    const body: TorrentStatus = req._data;
    if (!body.result || Object.keys(body.result).length === 0) {
      throw new TorrentClientError('Torrent not found', 'torrent_not_found');
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

  async pauseTorrent(torrentId: string | string[]): Promise<void> {
    const torrentIds = Array.isArray(torrentId) ? torrentId : [torrentId];
    await this.assertTorrentsExist(torrentIds);
    await this.request<DefaultResponse>('core.pause_torrent', [torrentIds]);
  }

  async resumeTorrent(torrentId: string | string[]): Promise<void> {
    const torrentIds = Array.isArray(torrentId) ? torrentId : [torrentId];
    await this.assertTorrentsExist(torrentIds);
    await this.request<DefaultResponse>('core.resume_torrent', [torrentIds]);
  }

  async setTorrentOptions(
    torrentId: string,
    options: Partial<TorrentOptions> = {},
  ): Promise<DefaultResponse> {
    const req = await this.request<DefaultResponse>('core.set_torrent_options', [
      [torrentId],
      legacyTorrentOptions(options),
    ]);
    return req._data;
  }

  async setTorrentTrackers(torrentId: string, trackers: Tracker[] = []): Promise<DefaultResponse> {
    const req = await this.request<DefaultResponse>('core.set_torrent_trackers', [
      torrentId,
      trackers,
    ]);
    return req._data;
  }

  /**
   * Moves the torrent data, returns before the move finishes
   */
  async moveStorage(torrentIds: string[], destination: string): Promise<DefaultResponse> {
    const req = await this.request<DefaultResponse>('core.move_storage', [torrentIds, destination]);
    return req._data;
  }

  /**
   * Renames files in a torrent, libtorrent renames them async so the new names can take a moment to show up
   * @param files `[fileIndex, newPath]` pairs, the path can include folders
   */
  async renameFiles(torrentId: string, files: Array<[number, string]>): Promise<DefaultResponse> {
    const req = await this.request<DefaultResponse>('core.rename_files', [torrentId, files]);
    return req._data;
  }

  /**
   * Renames a folder by renaming every file under it
   * @param folder ex - `'folder/'`
   * @param newFolder an empty string moves the contents up to the parent folder
   */
  async renameFolder(
    torrentId: string,
    folder: string,
    newFolder: string,
  ): Promise<DefaultResponse> {
    const req = await this.request<DefaultResponse>('core.rename_folder', [
      torrentId,
      folder,
      newFolder,
    ]);
    return req._data;
  }

  async getMagnetUri(torrentId: string): Promise<StringStatus> {
    const req = await this.request<StringStatus>('core.get_magnet_uri', [torrentId]);
    return req._data;
  }

  /**
   * Parses a magnet uri for its hash, name and trackers
   */
  async getMagnetInfo(uri: string): Promise<MagnetInfoResponse> {
    const req = await this.request<MagnetInfoResponse>('web.get_magnet_info', [uri]);
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

  /**
   * Pauses every torrent
   */
  async pauseSession(): Promise<DefaultResponse> {
    const req = await this.request<DefaultResponse>('core.pause_session', []);
    return req._data;
  }

  async resumeSession(): Promise<DefaultResponse> {
    const req = await this.request<DefaultResponse>('core.resume_session', []);
    return req._data;
  }

  async isSessionPaused(): Promise<BooleanStatus> {
    const req = await this.request<BooleanStatus>('core.is_session_paused', []);
    return req._data;
  }

  /**
   * Free bytes at path, -1 when the path doesn't exist
   * https://github.com/deluge-torrent/deluge/blob/deluge-2.2.0/deluge/core/core.py#L1244
   * @param path defaults to the download location
   */
  async getFreeSpace(path?: string): Promise<NumberStatus> {
    const req = await this.request<NumberStatus>('core.get_free_space', path ? [path] : []);
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

  async queueUp(torrentId: string | string[]): Promise<void> {
    const torrentIds = Array.isArray(torrentId) ? torrentId : [torrentId];
    await this.assertTorrentsExist(torrentIds);
    await this.request<DefaultResponse>('core.queue_up', [torrentIds]);
  }

  async queueDown(torrentId: string | string[]): Promise<void> {
    const torrentIds = Array.isArray(torrentId) ? torrentId : [torrentId];
    await this.assertTorrentsExist(torrentIds);
    await this.request<DefaultResponse>('core.queue_down', [torrentIds]);
  }

  /**
   * Deluge raises a KeyError for unknown ids when pausing, resuming or queueing
   */
  private async assertTorrentsExist(torrentIds: string[]): Promise<void> {
    const res = await this.request<{ result: Record<string, unknown> }>(
      'core.get_torrents_status',
      [{ id: torrentIds }, ['hash']],
    );
    if (Object.keys(res._data!.result).length < new Set(torrentIds).size) {
      throw new TorrentClientError('Torrent not found', 'torrent_not_found');
    }
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

  /**
   * @param plugin plugin name, an array is still accepted but deluge only reads one name
   */
  async getPluginInfo(plugin: string | string[]): Promise<PluginInfo> {
    const req = await this.request<PluginInfo>('web.get_plugin_info', [plugin].flat());
    return req._data;
  }

  /**
   * @param plugin plugin name, an array is still accepted but deluge only reads one name
   */
  async enablePlugin(plugin: string | string[]): Promise<BooleanStatus> {
    const req = await this.request<BooleanStatus>('core.enable_plugin', [plugin].flat());
    return req._data;
  }

  /**
   * @param plugin plugin name, an array is still accepted but deluge only reads one name
   */
  async disablePlugin(plugin: string | string[]): Promise<BooleanStatus> {
    const req = await this.request<BooleanStatus>('core.disable_plugin', [plugin].flat());
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
      Cookie: this.state.auth.cookieHeader,
    };
    const url = joinURL(this.config.baseUrl, this.config.path);

    const res = await ofetch
      .raw<T>(url, {
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
      })
      .catch((error: unknown) => {
        if (error instanceof FetchError) {
          throw new TorrentClientError(
            error.message,
            error.status === 401 || error.status === 403 ? 'unauthorized' : 'request_failed',
            { status: error.status, cause: error },
          );
        }

        throw new TorrentClientError((error as Error).message, 'request_failed', { cause: error });
      });

    // deluge returns json-rpc errors with a 200, res.body is the unread stream so check the parsed data
    const { error } = res._data as { error?: { message: string; code: number } | null };
    if (error) {
      throw new TorrentClientError(error.message, delugeErrorCode(error), { cause: error });
    }

    return res;
  }

  private async _validateAuth(): Promise<void> {
    let validAuth = await this.checkSession();
    validAuth ||= await this.login();

    if (!validAuth) {
      throw new TorrentClientError('Invalid Auth', 'unauthorized');
    }
  }

  private _setAuthCookie(setCookie: string | null): void {
    const authSetCookie = setCookie ? splitSetCookieString(setCookie)[0] : undefined;
    const parsed = authSetCookie ? parseSetCookie(authSetCookie) : undefined;
    const expiresValue = authSetCookie
      ? /(?:^|;)\s*expires=([^;]+)/i.exec(authSetCookie)?.[1]
      : undefined;
    const expires = expiresValue ? new Date(expiresValue) : undefined;

    this.state.auth.cookieHeader =
      parsed?.name && parsed.value !== undefined
        ? stringifyCookie({ [parsed.name]: parsed.value })
        : undefined;
    this.state.auth.expires =
      expires && !Number.isNaN(expires.getTime()) ? expires.toISOString() : undefined;
  }
}

/**
 * Translates deluge 1.3 option names that deluge 2.x silently ignores
 */
function legacyTorrentOptions<T extends Partial<TorrentOptions>>(options: T): T {
  const { prioritize_first_last, is_auto_managed, ...rest } = options;
  return {
    ...(prioritize_first_last === undefined
      ? {}
      : { prioritize_first_last_pieces: prioritize_first_last }),
    ...(is_auto_managed === undefined ? {} : { auto_managed: is_auto_managed }),
    ...rest,
  } as T;
}

/**
 * Deluge's web api uses code 1 when the session isn't authenticated
 * {@link https://github.com/deluge-torrent/deluge/blob/develop/deluge/ui/web/json_api.py}
 */
function delugeErrorCode(error: { message: string; code: number }): TorrentClientErrorCode {
  if (error.code === 1) {
    return 'unauthorized';
  }

  return error.message.includes('InvalidTorrentError') ? 'torrent_not_found' : 'client_error';
}
