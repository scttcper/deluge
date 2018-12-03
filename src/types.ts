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

export interface TorrentListResponse extends DefaultResponse {
  result: TorrentList;
}

export interface TorrentList {
  stats: Stats;
  connected: boolean;
  torrents: { [key: string]: Torrent };
  filters: TorrentFilters;
}

export interface TorrentFilters {
  state: [string, number][];
  tracker_host: [string, number][];
  label?: [string, number][];
}

export interface Stats {
  upload_protocol_rate: number;
  max_upload: number;
  download_protocol_rate: number;
  download_rate: number;
  has_incoming_connections: boolean;
  num_connections: number;
  max_download: number;
  upload_rate: number;
  dht_nodes: number;
  free_space: number;
  max_num_connections: number;
}

export interface Torrent {
  max_download_speed: number;
  upload_payload_rate: number;
  download_payload_rate: number;
  num_peers: number;
  ratio: number;
  total_peers: number;
  state: string;
  max_upload_speed: number;
  eta: number;
  save_path: string;
  progress: number;
  time_added: number;
  tracker_host: string;
  total_uploaded: number;
  total_done: number;
  total_wanted: number;
  total_seeds: number;
  seeds_peers_ratio: number;
  num_seeds: number;
  name: string;
  is_auto_managed: boolean;
  queue: number;
  distributed_copies: number;
  label?: string;
  [key: string]: any;
}

// https://github.com/biwin/deluge/blob/1.3-stable/deluge/core/preferencesmanager.py
export interface DelugeSettings {
  /**
   * Yes, please send anonymous statistics.
   * default: false
   */
  send_info?: boolean;
  /**
   * how many times info is sent? i dunno
   * default: 0
   */
  info_sent?: number;
  /**
   * default: 58846
   */
  daemon_port?: number;
  /**
   * set True if the server should allow remote connections
   * default: false
   */
  allow_remote?: boolean;
  /**
   * default: /Downloads
   */
  download_location: string;
  /**
   * incoming ports
   * default: [6881, 6891]
   */
  listen_ports: [number, number];
  /**
   * overrides listen_ports
   * default: true
   */
  random_port: boolean;
  /**
   * default: [0, 0]
   */
  outgoing_ports: [number, number];
  /**
   * default: true
   */
  random_outgoing_ports: boolean;
  // "listen_interface": "",
  // "copy_torrent_file": False,
  // "del_copy_torrent_file": False,
  // "torrentfiles_location": deluge.common.get_default_download_dir(),
  // "plugins_location": os.path.join(deluge.configmanager.get_config_dir(), "plugins"),
  // "prioritize_first_last_pieces": False,
  // "dht": True,
  // "upnp": True,
  // "natpmp": True,
  // "utpex": True,
  // "lsd": True,
  // "enc_in_policy": 1,
  // "enc_out_policy": 1,
  // "enc_level": 2,
  // "enc_prefer_rc4": True,
  // "max_connections_global": 200,
  // "max_upload_speed": -1.0,
  // "max_download_speed": -1.0,
  // "max_upload_slots_global": 4,
  // "max_half_open_connections": (lambda: deluge.common.windows_check() and (lambda: deluge.common.vista_check() and 4 or 8)() or 50)(),
  // "max_connections_per_second": 20,
  // "ignore_limits_on_local_network": True,
  // "max_connections_per_torrent": -1,
  // "max_upload_slots_per_torrent": -1,
  // "max_upload_speed_per_torrent": -1,
  // "max_download_speed_per_torrent": -1,
  // "enabled_plugins": [],
  // "autoadd_location": deluge.common.get_default_download_dir(),
  // "autoadd_enable": False,
  // "add_paused": False,
  // "max_active_seeding": 5,
  // "max_active_downloading": 3,
  // "max_active_limit": 8,
  // "dont_count_slow_torrents": False,
  // "queue_new_to_top": False,
  // "stop_seed_at_ratio": False,
  // "remove_seed_at_ratio": False,
  // "stop_seed_ratio": 2.00,
  // "share_ratio_limit": 2.00,
  // "seed_time_ratio_limit": 7.00,
  // "seed_time_limit": 180,
  // "auto_managed": True,
  // "move_completed": False,
  // "move_completed_path": deluge.common.get_default_download_dir(),
  // "new_release_check": True,
  proxies?: {
    peer: {
      type: 0 | 1 | 2 | 3 | 4 | 5;
      hostname: string;
      username: string;
      password: string;
      port: number;
    };
    web_seed: {
      type: 0 | 1 | 2 | 3 | 4 | 5;
      hostname: string;
      username: string;
      password: string;
      port: number;
    };
    tracker: {
      type: 0 | 1 | 2 | 3 | 4 | 5;
      hostname: string;
      username: string;
      password: string;
      port: number;
    };
    dht: {
      type: 0 | 1 | 2 | 3 | 4 | 5;
      hostname: string;
      username: string;
      password: string;
      port: number;
    };
  };
  /**
   * Peer TOS Byte
   * default: '0x00'
   */
  peer_tos?: string;
  /**
   * Rate limit IP overhead
   * default: true
   */
  rate_limit_ip_overhead: boolean;
  // "geoip_db_location": "/usr/share/GeoIP/GeoIP.dat",
  // "cache_size": 512,
  // "cache_expiry": 60
}
