import { resolve } from 'url';
import got, { Response } from 'got';
import { Cookie } from 'tough-cookie';
import FormData from 'form-data';
import fs from 'fs';

export interface DelugeConfig {
  baseURL: string;
  password: string;
}

export interface DefaultResponse {
  id: number;
  error: null | string;
  result: any;
}

export interface BooleanStatus extends DefaultResponse {
  result: boolean;
}

export interface ListMethods extends DefaultResponse {
  result: string[];
}

// {"files": ["/tmp/delugeweb-5Q9ttR/tmpL7xhth.torrent"], "success": true}
export interface UploadResponse {
  files: string[];
  success: boolean;
}

export interface GetHostsResponse extends DefaultResponse {
  /**
   * host id - ddf084f5f3d7945597991008949ea7b51e6b3d93
   * ip address - 127.0.0.1
   * not sure? - 58846
   * status - "Online"
   */
  result: [string, string, number, string];
}

export interface GetHostStatusResponse extends DefaultResponse {
  /**
   * host id - ddf084f5f3d7945597991008949ea7b51e6b3d93
   * ip address - 127.0.0.1
   * not sure? - 58846
   * status - "Online"
   * version - "1.3.15"
   */
  result: [string, string, number, 'Online' | 'Offline', string];
}

export interface TorrentContentFile {
  download: boolean;
  index: number;
  length: number;
  type: 'file';
  /**
   * has path when downloading folders
   */
  path?: string;
}

export interface TorrentContentDir {
  download: true;
  length: number;
  type: 'dir';
  contents: TorrentContentFile;
}

export interface TorrentInfo extends DefaultResponse {
  result: {
    files_tree: {
      contents: {
        [key: string]: TorrentContentDir | TorrentContentFile;
      };
    };
    name: string;
    info_hash: string;
  };
}

export interface AddTorrentOptions {
  file_priorities: any[];
  add_paused: boolean;
  compact_allocation: boolean;
  download_location?: string;
  max_connections: number;
  max_download_speed: number;
  max_upload_slots: number;
  max_upload_speed: number;
  prioritize_first_last_pieces: boolean;
  move_completed_path?: string;
}

const defaults: DelugeConfig = {
  baseURL: 'http://localhost:8112/',
  password: 'deluge',
};

export class Deluge {
  msgId = 0;
  cookie?: Cookie;
  config: DelugeConfig;

  constructor(options: Partial<DelugeConfig>) {
    this.config = { ...defaults, ...options };
    // baseURL requires end slash to get to json route
    if (this.config.baseURL[this.config.baseURL.length - 1] !== '/') {
      this.config.baseURL += '/';
    }
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
    const res = await this.request<BooleanStatus>("web.disconnect", [], true, false);
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
  async login() {
    this.resetSession();
    const res = await this.request<BooleanStatus>('auth.login', [this.config.password], false);
    if (!res.body.result || !res.headers || !res.headers['set-cookie']) {
      throw new Error('Auth failed, incorrect password');
    }
    this.cookie = Cookie.parse(res.headers['set-cookie'][0]);
    return true;
  }

  /**
   *
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

  private async request<T extends object>(
    method: string,
    params: any[] = [],
    needsAuth = true,
    autoConnect = true,
  ): Promise<Response<T>> {
    if (this.msgId === 1024) {
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
    const url = resolve(this.config.baseURL, 'json');
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
