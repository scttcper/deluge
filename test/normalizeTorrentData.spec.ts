import { TorrentState } from '@ctrl/shared-torrent';
import { expect, it } from 'vitest';

import { normalizeTorrentData } from '../src/normalizeTorrentData.js';
import type { Torrent } from '../src/types.js';

// trimmed from a deluge 2.2.0 web.update_ui response
const torrent: Torrent = {
  completed_time: 0,
  distributed_copies: 0,
  download_payload_rate: 0,
  eta: 0,
  is_auto_managed: true,
  is_finished: false,
  max_download_speed: -1,
  max_upload_speed: -1,
  message: 'OK',
  name: 'ubuntu-18.04.1-desktop-amd64.iso',
  num_peers: 0,
  num_seeds: 0,
  progress: 0,
  queue: 0,
  ratio: -1,
  save_path: '/downloads',
  seeds_peers_ratio: 0,
  state: 'Downloading',
  time_added: 1_791_172_800,
  total_done: 0,
  total_peers: -1,
  total_seeds: -1,
  total_size: 1_953_349_632,
  total_uploaded: 0,
  total_wanted: 1_953_349_632,
  tracker_host: '',
  upload_payload_rate: 0,
  comment: '',
  num_files: 1,
  tracker: '',
};

it('should normalize allocating as checking', () => {
  const result = normalizeTorrentData('id', { ...torrent, state: 'Allocating' });
  expect(result.state).toBe(TorrentState.checking);
  expect(result.stateMessage).toBe('');
});

it('should set date completed once finished', () => {
  const result = normalizeTorrentData('id', {
    ...torrent,
    state: 'Seeding',
    progress: 100,
    is_finished: true,
    completed_time: 1_791_176_400,
  });
  expect(result.isCompleted).toBe(true);
  expect(result.dateCompleted).toBe('2026-10-05T05:00:00.000Z');
});

it('should not be completed while moving', () => {
  const result = normalizeTorrentData('id', { ...torrent, state: 'Moving', progress: 100 });
  expect(result.isCompleted).toBe(false);
  expect(result.dateCompleted).toBeUndefined();
});
