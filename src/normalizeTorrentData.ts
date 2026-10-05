import { type NormalizedTorrent, TorrentState } from '@ctrl/shared-torrent';

import type { Torrent } from './types.js';

export function normalizeTorrentData(id: string, torrent: Torrent): NormalizedTorrent {
  const dateAdded = new Date(torrent.time_added * 1000).toISOString();

  // normalize state to enum
  let state = TorrentState.unknown;
  if (torrent.state === 'Allocating') {
    // pre allocating files before downloading
    state = TorrentState.checking;
  } else if (Object.keys(TorrentState).includes(torrent.state.toLowerCase())) {
    state = TorrentState[torrent.state.toLowerCase() as keyof typeof TorrentState];
  }

  // progress is 100 while in an error state and is the move progress while moving
  // https://github.com/deluge-torrent/deluge/blob/deluge-2.2.0/deluge/core/torrent.py#L977
  const isCompleted = torrent.is_finished;

  const result: NormalizedTorrent = {
    id,
    name: torrent.name,
    state,
    isCompleted,
    stateMessage: torrent.state === 'Error' ? torrent.message : torrent.state,
    progress: torrent.progress / 100,
    ratio: torrent.ratio,
    dateAdded,
    dateCompleted:
      torrent.completed_time > 0
        ? new Date(torrent.completed_time * 1000).toISOString()
        : undefined,
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
    raw: torrent,
  };
  return result;
}
