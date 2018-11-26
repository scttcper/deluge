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
  baseURL: 'http://localhost:8112',
  password: 'deluge',
};

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
      throw new Error('Auth failed, does the password valided?');
    }
    this.cookie = Cookie.parse(res.headers['set-cookie'][0]);
    return true;
  }

  async request<T extends object>(
    method: string,
    params: any[] = [],
    needsAuth = true,
  ): Promise<Response<T>> {
    if (this.msgId === 1024) {
      this.msgId = 0;
    }
    if (needsAuth) {
      await this.validateAuth();
    }
    const headers: any = {
      Cookie: this.cookie && this.cookie.cookieString(),
    };
    const url = resolve(this.config.baseURL, '/json');
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

  async changePassword(oldPassword: string, newPassword: string) {
    const res = await this.request<BooleanStatus>('auth.change_password', [
      oldPassword,
      newPassword,
    ]);
    return res.body;
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
