export interface DelugeConfig {
  /**
   * baseurl ex - `'http://localhost:8112/'`
   */
  baseURL: string;
  /**
   * ex - `'/json'`
   */
  path: string;
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

export type HostStatus = 'Online' | 'Offline' | 'Connected';
export interface GetHostStatusResponse extends DefaultResponse {
  /**
   * host id - ddf084f5f3d7945597991008949ea7b51e6b3d93
   * ip address - 127.0.0.1
   * not sure? - 58846
   * status - "Online"
   * version - "1.3.15"
   */
  result: [string, string, number, HostStatus, string];
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

export interface PluginInfo extends DefaultResponse {
  result: {
    Name: string;
    License: string;
    Author: string;
    'Home-page': string;
    Summary: string;
    Platform: string;
    Version: string;
    'Author-email': string;
    Description: string;
  };
}

export interface ConfigResponse extends DefaultResponse {
  result: DelugeSettings;
}

export interface PluginsListResponse extends DefaultResponse {
  result: {
    enabled_plugins: string[];
    available_plugins: string[];
  };
}

export interface Tracker {
  tier: number;
  url: string;
}

export interface TorrentStatus extends DefaultResponse {
  result: {
    max_download_speed?: number;
    stop_ratio?: number;
    is_auto_managed?: true;
    move_completed_path?: string;
    private?: boolean;
    stop_at_ratio?: boolean;
    max_upload_speed?: number;
    remove_at_ratio?: boolean;
    max_upload_slots?: number;
    prioritize_first_last?: boolean;
    move_completed?: boolean;
    max_connections?: number;
    comment?: string;
    name?: string;
    total_size?: number;
    num_files?: number;
    tracker?: string;
    save_path?: string;
    message?: string;
    peers?: TorrentPeers;
    trackers?: Tracker;
    [key: string]: any;
  };
}

export interface TorrentPeers {
  down_speed: number;
  ip: string;
  up_speed: number;
  client: string;
  country: string;
  progress: number;
  seed: number;
}

export interface TorrentFiles extends DefaultResponse {
  result: { [key: string]: TorrentContentDir | TorrentContentFile };
}

export interface TorrentOptions {
  max_download_speed: number;
  max_upload_speed: number;
  max_connections: number;
  max_upload_slots: number;
  prioritize_first_last: boolean;
  is_auto_managed: boolean;
  stop_at_ratio: boolean;
  stop_ratio: number;
  remove_at_ratio: boolean;
  move_completed: boolean;
  move_completed_path: string;
  super_seeding: boolean;
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
  /**
   * IP address to listen for BitTorrent connections
   * default: ""
   */
  listen_interface: string;
  /**
   * enable torrent copy dir
   * default: false
   */
  copy_torrent_file: boolean;
  /**
   * Copy of .torrent files to:
   */
  torrentfiles_location: string;
  /**
   * default: False
   */
  del_copy_torrent_file: boolean;
  plugins_location: string;
  /**
   * Prioritize first and last pieces of torrent
   * default: False
   */
  prioritize_first_last_pieces: boolean;
  /**
   * default: True
   */
  dht: boolean;
  /**
   * default: True
   */
  upnp: boolean;
  /**
   * default: True
   */
  natpmp: boolean;
  /**
   * default: True
   */
  utpex: boolean;
  /**
   * default: True
   */
  lsd: boolean;
  /**
   * default: 1
   */
  enc_in_policy: number;
  /**
   * default: 1
   */
  enc_out_policy: number;
  /**
   * default: 2
   */
  enc_level: number;
  /**
   * default: True
   */
  enc_prefer_rc4: boolean;
  /**
   * default: 200
   */
  max_connections_global: number;
  /**
   * default: -1
   */
  max_upload_speed: number;
  /**
   * default: -1
   */
  max_download_speed: number;
  /**
   * default: 4
   */
  max_upload_slots_global: number;
  /**
   * default: 50
   */
  max_half_open_connections: number;
  /**
   * default: 20
   */
  max_connections_per_second: number;
  /**
   * default: True
   */
  ignore_limits_on_local_network: boolean;
  /**
   * default: -1
   */
  max_connections_per_torrent: number;
  /**
   * default: -1
   */
  max_upload_slots_per_torrent: number;
  /**
   * default: -1
   */
  max_upload_speed_per_torrent: number;
  /**
   * default: -1
   */
  max_download_speed_per_torrent: number;
  enabled_plugins: [];
  // "autoadd_location": deluge.common.get_default_download_dir(),
  /**
   * default: False
   */
  autoadd_enable: boolean;
  /**
   * default: False
   */
  add_paused: boolean;
  max_active_seeding: 5;
  max_active_downloading: 3;
  max_active_limit: 8;
  /**
   * default: False
   */
  dont_count_slow_torrents: boolean;
  /**
   * default: False
   */
  queue_new_to_top: boolean;
  /**
   * default: False
   */
  stop_seed_at_ratio: boolean;
  /**
   * default: False
   */
  remove_seed_at_ratio: boolean;
  /**
   * default: 2
   */
  stop_seed_ratio: number;
  /**
   * default: 2
   */
  share_ratio_limit: number;
  /**
   * default: 7
   */
  seed_time_ratio_limit: number;
  /**
   * default: 180
   */
  seed_time_limit: number;
  /**
   * default: True
   */
  auto_managed: boolean;
  /**
   * default: False
   */
  move_completed: boolean;
  move_completed_path: string;
  /**
   * default: True
   */
  new_release_check: boolean;
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
  /**
   * default: '/usr/share/GeoIP/GeoIP.dat'
   */
  geoip_db_location: string;
  /**
   * default: 512
   */
  cache_size: number;
  /**
   * default: 60
   */
  cache_expiry: number;
}
