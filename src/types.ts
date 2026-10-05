export interface DefaultResponse {
  /**
   * mostly usless id that increments with every request
   */
  id: number;
  error: null | string;
  result: any;
}

export interface BooleanStatus extends DefaultResponse {
  result: boolean;
}

export interface StringStatus extends DefaultResponse {
  result: string;
}

export interface NumberStatus extends DefaultResponse {
  result: number;
}

export interface ListMethods extends DefaultResponse {
  result: string[];
}

export interface AddTorrentResponse extends DefaultResponse {
  result: Array<[boolean, string]>;
}

// {"files": ["/tmp/delugeweb-5Q9ttR/tmpL7xhth.torrent"], "success": true}
/**
 * ex -
 */
export interface UploadResponse {
  /**
   * ex - `["/tmp/delugeweb-5Q9ttR/tmpL7xhth.torrent"]`
   */
  files: string[];
  success: boolean;
}

export interface GetHostsResponse extends DefaultResponse {
  /**
   * host id - ddf084f5f3d7945597991008949ea7b51e6b3d93
   * ip address - 127.0.0.1
   * port - 58846
   * username - "localclient"
   */
  result: Array<[string, string, number, string]>;
}

export type HostStatus = 'Online' | 'Offline' | 'Connected';
export interface GetHostStatusResponse extends DefaultResponse {
  /**
   * host id - ddf084f5f3d7945597991008949ea7b51e6b3d93
   * status - "Online"
   * version - "1.3.15"
   */
  result: [string, HostStatus, string];
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
      contents: Record<string, TorrentContentDir | TorrentContentFile>;
    };
    name: string;
    info_hash: string;
  };
}

/**
 * Options only used when adding a torrent, anything left out uses the daemon's core.conf defaults
 * https://github.com/deluge-torrent/deluge/blob/deluge-2.2.0/deluge/core/torrent.py#L118
 */
export interface AddTorrentOptions extends TorrentOptions {
  add_paused: boolean;
  /**
   * Assume all files are present and skip checking them
   */
  seed_mode: boolean;
}

export interface MagnetInfoResponse extends DefaultResponse {
  /**
   * empty object when the uri isn't a valid magnet
   */
  result:
    | {
        name: string;
        info_hash: string;
        /**
         * always empty for magnets
         */
        files_tree: '';
        /**
         * tracker url to tier
         */
        trackers: Record<string, number>;
      }
    | Record<string, never>;
}

export interface RemoveTorrentsResponse extends DefaultResponse {
  /**
   * empty when every torrent was removed, otherwise `[torrentId, errorMessage]` pairs
   */
  result: Array<[string, string]>;
}

export interface TorrentListResponse extends DefaultResponse {
  result: TorrentList;
}

export interface TorrentList {
  stats: Stats;
  connected: boolean;
  torrents: Record<string, Torrent>;
  filters: TorrentFilters;
}

/**
 * ['label', 'id']
 */
export interface TorrentFilters {
  state: Array<[string, number]>;
  tracker_host: Array<[string, number]>;
  owner: Array<[string, number]>;
  /**
   * includes the `All` pseudo filter and `''` for torrents without a label
   */
  label?: Array<[string, number]>;
}

export interface Stats {
  upload_protocol_rate: number;
  max_upload: number;
  download_protocol_rate: number;
  download_rate: number;
  /**
   * 0 or 1
   */
  has_incoming_connections: number;
  num_connections: number;
  max_download: number;
  upload_rate: number;
  dht_nodes: number;
  free_space: number;
  max_num_connections: number;
  external_ip: string;
}

export interface Torrent {
  [key: string]: any;
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
  comment: string;
  num_files: number;
  total_size: number;
  progress: number;
  time_added: number;
  tracker_host: string;
  tracker: string;
  total_uploaded: number;
  total_done: number;
  total_wanted: number;
  total_seeds: number;
  seeds_peers_ratio: number;
  num_seeds: number;
  name: string;
  is_auto_managed: boolean;
  /**
   * all wanted pieces are downloaded
   */
  is_finished: boolean;
  /**
   * unix seconds, 0 until finished
   */
  completed_time: number;
  /**
   * status message, the error when state is `Error`
   */
  message: string;
  queue: number;
  distributed_copies: number;
  label?: string;
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
  result: Torrent;
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
  result: Record<string, TorrentContentDir | TorrentContentFile>;
}

/**
 * Per torrent options, used when adding and with `setTorrentOptions`.
 * Unknown keys are silently ignored by deluge.
 * https://github.com/deluge-torrent/deluge/blob/deluge-2.2.0/deluge/core/torrent.py#L118
 */
export interface TorrentOptions {
  auto_managed: boolean;
  /**
   * The path for the torrent data to be stored while downloading
   */
  download_location: string;
  /**
   * One per file, 0 skip, 1 low, 4 normal, 7 high
   */
  file_priorities: number[];
  max_connections: number;
  max_download_speed: number;
  max_upload_slots: number;
  max_upload_speed: number;
  move_completed: boolean;
  move_completed_path: string;
  /**
   * Display name of the torrent
   */
  name: string;
  /**
   * Deluge user this torrent belongs to, must be a known account
   */
  owner: string;
  pre_allocate_storage: boolean;
  prioritize_first_last_pieces: boolean;
  remove_at_ratio: boolean;
  sequential_download: boolean;
  /**
   * Allow other deluge users to see the torrent
   */
  shared: boolean;
  stop_at_ratio: boolean;
  stop_ratio: number;
  super_seeding: boolean;
}

/**
 * 0 none, 1 socks4, 2 socks5, 3 socks5 with auth, 4 http, 5 http with auth, 6 i2p
 */
export type ProxyType = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface ProxySettings {
  type: ProxyType;
  hostname: string;
  username: string;
  password: string;
  /**
   * default: 8080
   */
  port: number;
  /**
   * default: true
   */
  proxy_hostnames: boolean;
  /**
   * default: true
   */
  proxy_peer_connections: boolean;
  /**
   * default: true
   */
  proxy_tracker_connections: boolean;
  /**
   * default: false
   */
  force_proxy: boolean;
  /**
   * default: false
   */
  anonymous_mode: boolean;
}

/**
 * Result of `core.get_config`
 * https://github.com/deluge-torrent/deluge/blob/deluge-2.2.0/deluge/core/preferencesmanager.py#L37
 */
export interface DelugeSettings {
  /**
   * Yes, please send anonymous statistics.
   * default: false
   */
  send_info: boolean;
  /**
   * unix seconds of the last time info was sent
   * default: 0
   */
  info_sent: number;
  /**
   * default: 58846
   */
  daemon_port: number;
  /**
   * set True if the server should allow remote connections
   * default: false
   */
  allow_remote: boolean;
  /**
   * default: false
   */
  pre_allocate_storage: boolean;
  download_location: string;
  /**
   * incoming ports
   * default: [6881, 6891]
   */
  listen_ports: [number, number];
  /**
   * IP address or interface name to listen for BitTorrent connections
   * default: ""
   */
  listen_interface: string;
  /**
   * IP address or interface name used for outgoing connections
   * default: ""
   */
  outgoing_interface: string;
  /**
   * overrides listen_ports
   * default: true
   */
  random_port: boolean;
  /**
   * port picked when random_port is enabled, null until one is picked
   */
  listen_random_port: number | null;
  /**
   * default: false
   */
  listen_use_sys_port: boolean;
  /**
   * default: true
   */
  listen_reuse_port: boolean;
  /**
   * default: [0, 0]
   */
  outgoing_ports: [number, number];
  /**
   * default: true
   */
  random_outgoing_ports: boolean;
  /**
   * enable torrent copy dir
   * default: false
   */
  copy_torrent_file: boolean;
  /**
   * default: false
   */
  del_copy_torrent_file: boolean;
  /**
   * Copy of .torrent files to:
   */
  torrentfiles_location: string;
  plugins_location: string;
  /**
   * Prioritize first and last pieces of torrent
   * default: false
   */
  prioritize_first_last_pieces: boolean;
  /**
   * default: false
   */
  sequential_download: boolean;
  /**
   * default: true
   */
  dht: boolean;
  /**
   * default: true
   */
  upnp: boolean;
  /**
   * default: true
   */
  natpmp: boolean;
  /**
   * default: true
   */
  utpex: boolean;
  /**
   * default: true
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
   * default: true
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
  enabled_plugins: string[];
  /**
   * default: false
   */
  add_paused: boolean;
  /**
   * default: 5
   */
  max_active_seeding: number;
  /**
   * default: 3
   */
  max_active_downloading: number;
  /**
   * default: 8
   */
  max_active_limit: number;
  /**
   * default: false
   */
  dont_count_slow_torrents: boolean;
  /**
   * default: false
   */
  queue_new_to_top: boolean;
  /**
   * default: false
   */
  stop_seed_at_ratio: boolean;
  /**
   * default: false
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
   * default: true
   */
  auto_managed: boolean;
  /**
   * default: false
   */
  move_completed: boolean;
  move_completed_path: string;
  /**
   * recently used paths in the gtk ui
   */
  move_completed_paths_list: string[];
  /**
   * recently used paths in the gtk ui
   */
  download_location_paths_list: string[];
  /**
   * default: true
   */
  path_chooser_show_chooser_button_on_localhost: boolean;
  /**
   * default: true
   */
  path_chooser_auto_complete_enabled: boolean;
  /**
   * default: 'Tab'
   */
  path_chooser_accelerator_string: string;
  /**
   * default: 20
   */
  path_chooser_max_popup_rows: number;
  /**
   * default: false
   */
  path_chooser_show_hidden_files: boolean;
  /**
   * default: true
   */
  new_release_check: boolean;
  proxy: ProxySettings;
  /**
   * Peer TOS Byte
   * default: '0x00'
   */
  peer_tos: string;
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
  /**
   * default: false
   */
  auto_manage_prefer_seeds: boolean;
  /**
   * Allow other deluge users to see new torrents
   * default: false
   */
  shared: boolean;
  /**
   * default: false
   */
  super_seeding: boolean;
}
