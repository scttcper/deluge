import { readFileSync } from 'node:fs';
import path from 'node:path';

import { TorrentState } from '@ctrl/shared-torrent';
import pWaitFor from 'p-wait-for';
import { uint8ArrayToBase64 } from 'uint8array-extras';
import { afterEach, beforeAll, expect, it } from 'vitest';

import { Deluge } from '../src/index.js';
import type { TorrentListResponse } from '../src/types.js';

const baseUrl = 'http://localhost:8112';
const torrentName = 'ubuntu-18.04.1-desktop-amd64.iso';
const __dirname = new URL('.', import.meta.url).pathname;
const torrentFilePath = path.join(__dirname, 'ubuntu-18.04.1-desktop-amd64.iso.torrent');
const torrentFileBuffer = readFileSync(torrentFilePath);
const torrentHash = 'e84213a794f3ccd890382a54a64ca68b7e925433';

async function setupTorrent(deluge: Deluge): Promise<TorrentListResponse> {
  await deluge.addTorrent(torrentFileBuffer, { add_paused: true });
  await pWaitFor(
    async () => {
      const r = await deluge.listTorrents();
      return Object.keys(r.result.torrents).length === 1;
    },
    { timeout: 10_000 },
  );
  const res = await deluge.listTorrents();
  // biome-ignore lint/suspicious/noMisplacedAssertion: its fine
  expect(Object.keys(res.result.torrents)).toHaveLength(1);
  return res;
}

beforeAll(async () => {
  const deluge = new Deluge({ baseUrl });
  await deluge.enablePlugin('Label');
});
afterEach(async () => {
  const deluge = new Deluge({ baseUrl });
  const torrents = await deluge.listTorrents();
  const ids = Object.keys(torrents.result.torrents);
  for (const id of ids) {
    // clean up all torrents
    await deluge.removeTorrent(id, true);
  }
});
it('should be instantiable', () => {
  const deluge = new Deluge({ baseUrl });
  expect(deluge).toBeTruthy();
});
it('should disconnect', async () => {
  const deluge = new Deluge({ baseUrl });
  await deluge.connect();
  const res = await deluge.disconnect();
  expect(res).toBe(true);
});
it('should connect', async () => {
  const deluge = new Deluge({ baseUrl });
  const res = await deluge.connect();
  // theres a bunch
  expect(res.result.length).toBeGreaterThan(2);
});
it.skip('should get plugins', async () => {
  const deluge = new Deluge({ baseUrl });
  const res = await deluge.getPlugins();
  // not sure what's going on here
  expect(res.result.enabled_plugins.length).toBeGreaterThan(0);
  expect(res.result.available_plugins).toBeDefined();
  expect(res.result.available_plugins).toContain('Label');
});
it('should get plugins info', async () => {
  const deluge = new Deluge({ baseUrl });
  const res = await deluge.getPluginInfo('Label');
  expect(res.result.Name).toBe('Label');
  expect(res.result.License).toBe('GPLv3');
});
it('should get version', async () => {
  const deluge = new Deluge({ baseUrl });
  const res = await deluge.getVersion();
  expect(res.result.startsWith('2')).toBe(true);
});
// for some reason explodes deluge
// it('should enable/disable plugins', async () => {
//   const deluge = new Deluge({ baseURL });
//   await deluge.enablePlugin('Label');
//   const after = await deluge.getPlugins();
//   expect(after.result.enabled_plugins).toEqual(['Label']);
//   await deluge.disablePlugin('Label');
// });
it('should throw json-rpc errors', async () => {
  const deluge = new Deluge({ baseUrl });
  await expect(deluge.request('core.not_a_method')).rejects.toThrow('Unknown method');
});

it('should get config', async () => {
  const deluge = new Deluge({ baseUrl });
  const res = await deluge.getConfig();
  expect(res.result.dht).toBeDefined();
  expect(res.result.proxy.type).toBe(0);
  expect(res.result.max_active_seeding).toBe(5);
});
it('should set config', async () => {
  const deluge = new Deluge({ baseUrl });
  const startConfig = await deluge.getConfig();
  expect(startConfig.result.upnp).toBe(true);
  await deluge.setConfig({ upnp: false });
  const res = await deluge.getConfig();
  expect(res.result.upnp).toBe(false);
  await deluge.setConfig({ upnp: true });
});
it('should login', async () => {
  const deluge = new Deluge({ baseUrl });
  const success = await deluge.login();
  expect(success).toBe(true);
});
it('should logout', async () => {
  const deluge = new Deluge({ baseUrl });
  await deluge.login();
  const success = await deluge.logout();
  expect(success).toBe(true);
});
it('should change password', async () => {
  const deluge = new Deluge({ baseUrl });
  const oldPassword = 'deluge';
  const newPassword = 'deluge1';
  // change password
  expect(deluge.config.password).toBe(oldPassword);
  const res = await deluge.changePassword(newPassword);
  expect(res.result).toBe(true);
  expect(deluge.config.password).toBe(newPassword);
  // change password back
  const res1 = await deluge.changePassword(oldPassword);
  expect(res1.result).toBe(true);
  expect(deluge.config.password).toBe(oldPassword);
  deluge.config.password = 'wrongpassword';
  await expect(deluge.changePassword('shouldfail')).rejects.toThrowError();
});
it('should list methods', async () => {
  const deluge = new Deluge({ baseUrl });
  const methods = await deluge.listMethods();
  expect(Array.isArray(methods.result)).toEqual(true);
  expect(methods.result.length).toBeGreaterThanOrEqual(88);
});
it('should add torrent from string', async () => {
  const deluge = new Deluge({ baseUrl });
  const res = await deluge.addTorrent(torrentFileBuffer.toString('base64'));
  expect(res.result[0][0]).toBe(true);
  expect(res.result[0][1]).toBe(torrentHash);
});
it('should add torrent from file buffer', async () => {
  const deluge = new Deluge({ baseUrl });
  const res = await deluge.addTorrent(torrentFileBuffer);
  expect(res.result[0][0]).toBe(true);
  expect(res.result[0][1]).toBe(torrentHash);
});
it('should add torrent from file contents base64', async () => {
  const deluge = new Deluge({ baseUrl });
  const contents = uint8ArrayToBase64(torrentFileBuffer);
  const res = await deluge.addTorrent(contents);
  expect(res.result[0][0]).toBe(true);
  expect(res.result[0][1]).toBe(torrentHash);
});
it('should get torrent status', async () => {
  const deluge = new Deluge({ baseUrl });
  const res = await setupTorrent(deluge);
  const keys = Object.keys(res.result.torrents);
  for (const key of keys) {
    const status = await deluge.getTorrentStatus(key);
    expect(status.result.name).toEqual(torrentName);
  }
});
it('should list torrents', async () => {
  const deluge = new Deluge({ baseUrl });
  await setupTorrent(deluge);
  const res = await deluge.listTorrents();
  expect(res.result.torrents).toBeDefined();
  const keys = Object.keys(res.result.torrents);
  expect(keys.length).toEqual(1);
  for (const key of keys) {
    const torrent = res.result.torrents[key];
    expect(torrent.is_auto_managed).toBe(true);
    expect(torrent.total_size).toBe(1_953_349_632);
  }

  expect(typeof res.result.stats.has_incoming_connections).toBe('number');
  expect(res.result.filters.owner).toBeDefined();
});
it('should get array of normalized torrent data', async () => {
  const deluge = new Deluge({ baseUrl });
  await setupTorrent(deluge);
  const res = await deluge.getAllData();
  expect(res.torrents).toHaveLength(1);
  for (const torrent of res.torrents) {
    expect(torrent.id).toBeDefined();
    expect(torrent.name).toBe(torrentName);
  }
});
it('should get normalized torrent data', async () => {
  const deluge = new Deluge({ baseUrl });
  const res = await setupTorrent(deluge);
  const keys = Object.keys(res.result.torrents);
  for (const key of keys) {
    const torrent = await deluge.getTorrent(key);
    expect(torrent.name).toEqual(torrentName);
  }
});
it('should move torrents in queue', async () => {
  const deluge = new Deluge({ baseUrl });
  const res = await setupTorrent(deluge);
  const key = Object.keys(res.result.torrents)[0];
  await deluge.queueUp(key);
  await deluge.queueDown(key);
  await deluge.queueTop(key);
  await deluge.queueBottom(key);
});
it('should force recheck torrent', async () => {
  const deluge = new Deluge({ baseUrl });
  const res = await setupTorrent(deluge);
  const key = Object.keys(res.result.torrents)[0];
  await deluge.verifyTorrent(key);
});
it('should update torrent trackers', async () => {
  const deluge = new Deluge({ baseUrl });
  const res = await setupTorrent(deluge);
  const key = Object.keys(res.result.torrents)[0];
  await deluge.updateTorrentTrackers(key);
});
it('should add label', async () => {
  const client = new Deluge({ baseUrl });
  const list = await setupTorrent(client);
  const key = Object.keys(list.result.torrents)[0];
  await client.addLabel('swag');
  const res = await client.setTorrentLabel(key, 'swag');
  await client.removeLabel('swag');
  expect(res.result).toBe(null);
});
it('should pause/resume torrents', async () => {
  const deluge = new Deluge({ baseUrl });
  const res = await setupTorrent(deluge);
  const keys = Object.keys(res.result.torrents);
  for (const key of keys) {
    await deluge.pauseTorrent(key);
  }

  for (const key of keys) {
    await deluge.resumeTorrent(key);
  }
});
it('should set torrent options', async () => {
  const deluge = new Deluge({ baseUrl });
  const res = await setupTorrent(deluge);
  const keys = Object.keys(res.result.torrents);
  for (const key of keys) {
    await deluge.setTorrentOptions(key, { max_download_speed: 22 });
    await deluge.setTorrentOptions(key, { max_download_speed: 0 });
  }
});
it('should error when torrent hash does not exist', async () => {
  const client = new Deluge({ baseUrl });
  await expect(client.getTorrentStatus('abc123hash')).rejects.toThrowError();
});
it('should return normalized torrent data', async () => {
  const client = new Deluge({ baseUrl });
  await setupTorrent(client);
  const res = await client.getAllData();
  const torrent = res.torrents[0];
  expect(torrent.connectedPeers).toBe(0);
  expect(torrent.connectedSeeds).toBe(0);
  expect(torrent.downloadSpeed).toBe(0);
  expect(torrent.eta).toBe(0);
  expect(torrent.isCompleted).toBe(false);
  expect(torrent.dateCompleted).toBeUndefined();
  // expect(torrent.label).toBe(undefined);
  expect(torrent.name).toBe(torrentName);
  expect(torrent.progress).toBeGreaterThanOrEqual(0);
  expect(torrent.queuePosition).toBe(1);
  // expect(torrent.ratio).toBe(-1);
  // expect(torrent.savePath).toBe('/root/Downloads');
  // expect(torrent.state).toBe('checking');
  // expect(torrent.stateMessage).toBe('');
  expect(torrent.totalDownloaded).toBe(0);
  expect(torrent.totalPeers).toBe(-1);
  expect(torrent.totalSeeds).toBe(-1);
  expect(torrent.totalSelected).toBe(1_953_349_632);
  expect(torrent.totalSize).toBe(1_953_349_632);
  expect(torrent.totalUploaded).toBe(0);
  expect(torrent.uploadSpeed).toBe(0);
});
it('should add torrent with normalized response', async () => {
  const client = new Deluge({ baseUrl });

  // try adding label
  try {
    await client.addLabel('test');
  } catch {
    // ignore
  }

  const torrent = await client.normalizedAddTorrent(torrentFileBuffer, {
    label: 'test',
  });
  expect(torrent.connectedPeers).toBeGreaterThanOrEqual(0);
  expect(torrent.connectedSeeds).toBeGreaterThanOrEqual(0);
  expect(torrent.downloadSpeed).toBeGreaterThanOrEqual(0);
  expect(torrent.eta).toBeGreaterThanOrEqual(0);
  // expect(torrent.isCompleted).toBe(false);
  // its setting the label but it takes an unknown number of seconds to save to db
  // expect(torrent.label).toBe('');
  expect(torrent.name).toBe(torrentName);
  expect(torrent.progress).toBeGreaterThanOrEqual(0);
  expect(torrent.queuePosition).toBe(1);
  // expect(torrent.ratio).toBe(-1);
  // expect(torrent.savePath).toBe('/downloads/');
  // expect(torrent.state).toBe(TorrentState.checking);
  // expect(torrent.stateMessage).toBe('');
  expect(torrent.totalDownloaded).toBeGreaterThanOrEqual(0);
  expect(torrent.totalPeers).toBe(-1);
  expect(torrent.totalSeeds).toBe(-1);
  expect(torrent.totalSelected).toBe(1_953_349_632);
  // expect(torrent.totalSize).toBe(undefined);
  expect(torrent.totalUploaded).toBeGreaterThanOrEqual(0);
  expect(torrent.uploadSpeed).toBeGreaterThanOrEqual(0);
}, 15_000);
it('should download from url', async () => {
  const client = new Deluge({ baseUrl });
  const result = await client.downloadFromUrl(
    'https://releases.ubuntu.com/20.10/ubuntu-20.10-desktop-amd64.iso.torrent',
  );
  // Should be a file path but it is different on different systems
  expect(result).toContain('/');
  await client.addTorrent(result, { add_paused: true });
  await pWaitFor(
    async () => {
      const r = await client.listTorrents();
      return Object.keys(r.result.torrents).length === 1;
    },
    { timeout: 10_000 },
  );
  const res = await client.listTorrents();
  expect(Object.keys(res.result.torrents)).toHaveLength(1);
}, 15_000);
it('should add torrent with normalized response paused', async () => {
  const client = new Deluge({ baseUrl });
  const torrent = await client.normalizedAddTorrent(torrentFileBuffer, { startPaused: true });
  expect(torrent.state).toBe(TorrentState.paused);
  expect(torrent.stateMessage).toBe('Paused');
  expect(torrent.isCompleted).toBe(false);
  expect(torrent.totalSize).toBe(1_953_349_632);
});
it('should add torrent using the daemon defaults', async () => {
  const client = new Deluge({ baseUrl });
  await client.setConfig({ add_paused: true, sequential_download: true });
  try {
    await client.addTorrent(torrentFileBuffer);
    const status = await client.getTorrentStatus(torrentHash, ['sequential_download']);
    expect(status.result.state).toBe('Paused');
    expect(status.result.sequential_download).toBe(true);
  } finally {
    await client.setConfig({ add_paused: false, sequential_download: false });
  }
});
it('should add magnet and return the hash', async () => {
  const client = new Deluge({ baseUrl });
  const magnetHash = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
  const res = await client.addTorrentMagnet(`magnet:?xt=urn:btih:${magnetHash}&dn=example`, {
    add_paused: true,
  });
  expect(res.result).toBe(magnetHash);
});
it('should set torrent trackers', async () => {
  const client = new Deluge({ baseUrl });
  await setupTorrent(client);
  const trackers = [{ url: 'http://tracker.example.com/announce', tier: 0 }];
  await client.setTorrentTrackers(torrentHash, trackers);
  // the web ui caches torrent status for a moment
  await pWaitFor(
    async () => {
      const status = await client.getTorrentStatus(torrentHash, ['trackers']);
      return status.result.trackers[0].url === trackers[0].url;
    },
    { timeout: 10_000 },
  );
});
it('should set 2.x torrent options', async () => {
  const client = new Deluge({ baseUrl });
  await setupTorrent(client);
  await client.setTorrentOptions(torrentHash, {
    auto_managed: false,
    prioritize_first_last_pieces: true,
    sequential_download: true,
    name: 'renamed',
  });
  const fields = ['auto_managed', 'prioritize_first_last_pieces', 'sequential_download'];
  // the web ui caches torrent status for a moment
  await pWaitFor(
    async () => {
      const status = await client.getTorrentStatus(torrentHash, fields);
      return status.result.name === 'renamed';
    },
    { timeout: 10_000 },
  );
  const status = await client.getTorrentStatus(torrentHash, fields);
  expect(status.result.auto_managed).toBe(false);
  expect(status.result.prioritize_first_last_pieces).toBe(true);
  expect(status.result.sequential_download).toBe(true);
  expect(status.result.name).toBe('renamed');
});
it('should translate deluge 1.3 torrent option names', async () => {
  const client = new Deluge({ baseUrl });
  await setupTorrent(client);
  await client.setTorrentOptions(torrentHash, {
    is_auto_managed: false,
    prioritize_first_last: true,
    name: 'legacy',
  });
  const fields = ['auto_managed', 'prioritize_first_last_pieces'];
  // the web ui caches torrent status for a moment
  await pWaitFor(
    async () => {
      const status = await client.getTorrentStatus(torrentHash, fields);
      return status.result.name === 'legacy';
    },
    { timeout: 10_000 },
  );
  const status = await client.getTorrentStatus(torrentHash, fields);
  expect(status.result.auto_managed).toBe(false);
  expect(status.result.prioritize_first_last_pieces).toBe(true);
});
it('should still accept plugin names as an array', async () => {
  const client = new Deluge({ baseUrl });
  const res = await client.getPluginInfo(['Label']);
  expect(res.result.Name).toBe('Label');
});
it('should skip pseudo labels in all data', async () => {
  const client = new Deluge({ baseUrl });
  await setupTorrent(client);
  await client.addLabel('alldata');
  try {
    await client.setTorrentLabel(torrentHash, 'alldata');
    const res = await client.getAllData();
    const ids = res.labels.map(label => label.id);
    expect(ids).not.toContain('All');
    expect(ids).not.toContain('');
    expect(res.labels).toContainEqual({ id: 'alldata', name: 'alldata', count: 1 });
  } finally {
    await client.removeLabel('alldata');
  }
});
it('should normalize error state', async () => {
  const client = new Deluge({ baseUrl });
  // can't create the download folder so allocating the files errors
  await client.addTorrent(torrentFileBuffer, {
    download_location: '/proc/deluge-test',
    pre_allocate_storage: true,
  });
  await pWaitFor(
    async () => {
      const status = await client.getTorrentStatus(torrentHash);
      return status.result.state === 'Error';
    },
    { timeout: 10_000 },
  );
  const torrent = await client.getTorrent(torrentHash);
  expect(torrent.state).toBe(TorrentState.error);
  // deluge reports 100 progress while errored
  expect(torrent.progress).toBe(1);
  expect(torrent.isCompleted).toBe(false);
  expect(torrent.dateCompleted).toBeUndefined();
  expect(torrent.stateMessage).toBe('No such file or directory');
}, 15_000);
it('should move storage', async () => {
  const client = new Deluge({ baseUrl });
  await setupTorrent(client);
  await client.moveStorage([torrentHash], '/tmp/deluge-moved');
  await pWaitFor(
    async () => {
      const status = await client.getTorrentStatus(torrentHash);
      return status.result.save_path === '/tmp/deluge-moved';
    },
    { timeout: 10_000 },
  );
});
it('should rename files and folders', async () => {
  const client = new Deluge({ baseUrl });
  await setupTorrent(client);
  const filePath = async () => {
    const status = await client.getTorrentStatus(torrentHash, ['files']);
    return status.result.files[0].path as string;
  };

  await client.renameFiles(torrentHash, [[0, 'folder/renamed.iso']]);
  await pWaitFor(async () => (await filePath()) === 'folder/renamed.iso', { timeout: 10_000 });
  await client.renameFolder(torrentHash, 'folder/', 'other/');
  await pWaitFor(async () => (await filePath()) === 'other/renamed.iso', { timeout: 10_000 });
});
it('should remove multiple torrents', async () => {
  const client = new Deluge({ baseUrl });
  await setupTorrent(client);
  const res = await client.removeTorrents([torrentHash, 'abc123hash'], true);
  expect(res.result).toEqual([['abc123hash', 'torrent_id abc123hash not in session.']]);
  const list = await client.listTorrents();
  expect(Object.keys(list.result.torrents)).toHaveLength(0);
});
it('should pause and resume the session', async () => {
  const client = new Deluge({ baseUrl });
  try {
    await client.pauseSession();
    expect((await client.isSessionPaused()).result).toBe(true);
  } finally {
    await client.resumeSession();
  }

  expect((await client.isSessionPaused()).result).toBe(false);
});
it('should get magnet uri', async () => {
  const client = new Deluge({ baseUrl });
  await setupTorrent(client);
  const res = await client.getMagnetUri(torrentHash);
  expect(res.result).toContain(`magnet:?xt=urn:btih:${torrentHash}`);
  expect(res.result).toContain(`dn=${torrentName}`);
});
it('should get magnet info', async () => {
  const client = new Deluge({ baseUrl });
  const res = await client.getMagnetInfo(
    `magnet:?xt=urn:btih:${torrentHash}&dn=${torrentName}&tr=http://tracker.example.com/announce`,
  );
  expect(res.result).toEqual({
    name: torrentName,
    info_hash: torrentHash,
    files_tree: '',
    trackers: { 'http://tracker.example.com/announce': 0 },
  });
  const invalid = await client.getMagnetInfo('not a magnet');
  expect(invalid.result).toEqual({});
});
it('should get free space', async () => {
  const client = new Deluge({ baseUrl });
  const res = await client.getFreeSpace('/tmp');
  expect(res.result).toBeGreaterThan(0);
  const missing = await client.getFreeSpace('/does/not/exist');
  expect(missing.result).toBe(-1);
  const fallback = await client.getFreeSpace();
  expect(typeof fallback.result).toBe('number');
});
