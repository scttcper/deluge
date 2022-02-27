/* eslint-disable no-await-in-loop */
import fs from 'node:fs';
import path from 'node:path';

import test from 'ava';
import pWaitFor from 'p-wait-for';

import { Deluge } from '../src/index.js';
import { TorrentListResponse } from '../src/types.js';

const baseUrl = 'http://localhost:8112';
const torrentName = 'ubuntu-18.04.1-desktop-amd64.iso';
const __dirname = new URL('.', import.meta.url).pathname;
const torrentFile = path.join(__dirname, '/ubuntu-18.04.1-desktop-amd64.iso.torrent');
const torrentHash = 'e84213a794f3ccd890382a54a64ca68b7e925433';
const magnet =
  'magnet:?xt=urn:btih:B0B81206633C42874173D22E564D293DAEFC45E2&dn=Ubuntu+11+10+Alternate+Amd64+Iso&tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969%2Fannounce&tr=udp%3A%2F%2F9.rarbg.to%3A2710%2Fannounce&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce&tr=udp%3A%2F%2Ftracker.leechers-paradise.org%3A6969%2Fannounce&tr=udp%3A%2F%2Ftracker.open-internet.nl%3A6969%2Fannounce&tr=udp%3A%2F%2Fopen.demonii.si%3A1337%2Fannounce&tr=udp%3A%2F%2Ftracker.pirateparty.gr%3A6969%2Fannounce&tr=udp%3A%2F%2Fdenis.stalker.upeer.me%3A6969%2Fannounce&tr=udp%3A%2F%2Fp4p.arenabg.com%3A1337%2Fannounce&tr=udp%3A%2F%2Fexodus.desync.com%3A6969%2Fannounce';

async function setupTorrent(deluge: Deluge): Promise<TorrentListResponse> {
  await deluge.addTorrent(torrentFile, { add_paused: true });
  await pWaitFor(
    async () => {
      const r = await deluge.listTorrents();
      return Object.keys(r.result.torrents).length === 1;
    },
    { timeout: 10000 },
  );
  const res = await deluge.listTorrents();
  // expect(Object.keys(res.result.torrents)).toHaveLength(1);
  return res;
}

test.serial.before(async () => {
  const deluge = new Deluge({ baseUrl });
  await deluge.enablePlugin(['Label']);
});
test.serial.afterEach(async () => {
  const deluge = new Deluge({ baseUrl });
  const torrents = await deluge.listTorrents();
  const ids = Object.keys(torrents.result.torrents);
  for (const id of ids) {
    // clean up all torrents
    await deluge.removeTorrent(id, true);
  }
});
test.serial('should be instantiable', (t) => {
  const deluge = new Deluge({ baseUrl });
  t.truthy(deluge);
});
test.serial('should disconnect', async (t) => {
  const deluge = new Deluge({ baseUrl });
  await deluge.connect();
  const res = await deluge.disconnect();
  t.true(res);
});
test.serial('should connect', async (t) => {
  const deluge = new Deluge({ baseUrl });
  const res = await deluge.connect();
  // theres a bunch
  t.assert(res.result.length > 2);
});
test.serial('should get plugins', async (t) => {
  const deluge = new Deluge({ baseUrl });
  const res = await deluge.getPlugins();
  t.assert(res.result.enabled_plugins.length > 0);
  t.truthy(res.result.available_plugins);
  t.assert(res.result.available_plugins.includes('Label'));
});
test.serial('should get plugins info', async (t) => {
  const deluge = new Deluge({ baseUrl });
  const res = await deluge.getPluginInfo(['Label']);
  t.is(res.result.License, 'GPLv3');
});
test.serial('should get version', async (t) => {
  const deluge = new Deluge({ baseUrl });
  const res = await deluge.getVersion();
  console.log({ version: res.result });
  t.true(res.result.startsWith('2.0'));
});
// for some reason explodes deluge
// it('should enable/disable plugins', async () => {
//   const deluge = new Deluge({ baseURL });
//   await deluge.enablePlugin(['Label']);
//   const after = await deluge.getPlugins();
//   expect(after.result.enabled_plugins).toEqual(['Label']);
//   await deluge.disablePlugin(['Label']);
// });
test.serial('should get config', async (t) => {
  const deluge = new Deluge({ baseUrl });
  const res = await deluge.getConfig();
  t.truthy(res.result.dht);
});
test.serial('should set config', async (t) => {
  const deluge = new Deluge({ baseUrl });
  const startConfig = await deluge.getConfig();
  t.true(startConfig.result.upnp);
  await deluge.setConfig({ upnp: false });
  const res = await deluge.getConfig();
  t.false(res.result.upnp);
  await deluge.setConfig({ upnp: true });
});
test.serial('should login', async (t) => {
  const deluge = new Deluge({ baseUrl });
  const success = await deluge.login();
  t.true(success);
});
test.serial('should logout', async (t) => {
  const deluge = new Deluge({ baseUrl });
  await deluge.login();
  const success = await deluge.logout();
  t.true(success);
});
test.serial('should change password', async (t) => {
  const deluge = new Deluge({ baseUrl });
  const oldPassword = 'deluge';
  const newPassword = 'deluge1';
  // change password
  t.is(deluge.config.password, oldPassword);
  const res = await deluge.changePassword(newPassword);
  t.is(res.result, true);
  t.is(deluge.config.password, newPassword);
  // change password back
  const res1 = await deluge.changePassword(oldPassword);
  t.true(res1.result);
  t.is(deluge.config.password, oldPassword);
  deluge.config.password = 'wrongpassword';
  await t.throwsAsync(deluge.changePassword('shouldfail'));
});
test.serial('should list methods', async (t) => {
  const deluge = new Deluge({ baseUrl });
  const methods = await deluge.listMethods();
  t.true(Array.isArray(methods.result));
  t.assert(methods.result.length >= 88);
});
test.serial('should upload torrent from full path', async (t) => {
  const deluge = new Deluge({ baseUrl });
  const res = await deluge.upload(torrentFile);
  t.assert(res.files.length === 1);
  t.true(res.success);
});
test.serial('should add torrent from file path string', async (t) => {
  const deluge = new Deluge({ baseUrl });
  const res = await deluge.addTorrent(torrentFile);
  t.true(res.result[0][0]);
  t.is(res.result[0][1], torrentHash);
});
test.serial('should add torrent from file buffer', async (t) => {
  const deluge = new Deluge({ baseUrl });
  const res = await deluge.addTorrent(fs.readFileSync(torrentFile));
  t.true(res.result[0][0]);
  t.is(res.result[0][1], torrentHash);
});
test.serial('should add torrent from file contents base64', async (t) => {
  const deluge = new Deluge({ baseUrl });
  const contents = Buffer.from(fs.readFileSync(torrentFile)).toString('base64');
  const res = await deluge.addTorrent(contents);
  t.true(res.result[0][0]);
  t.is(res.result[0][1], torrentHash);
});
test.serial('should get torrent status', async (t) => {
  const deluge = new Deluge({ baseUrl });
  const res = await setupTorrent(deluge);
  const keys = Object.keys(res.result.torrents);
  for (const key of keys) {
    const status = await deluge.getTorrentStatus(key);
    t.is(status.result.name, torrentName);
  }
});
test.serial('should list torrents', async (t) => {
  const deluge = new Deluge({ baseUrl });
  await setupTorrent(deluge);
  const res = await deluge.listTorrents();
  t.truthy(res.result.torrents);
  const keys = Object.keys(res.result.torrents);
  t.is(keys.length, 1);
  for (const key of keys) {
    const torrent = res.result.torrents[key];
    t.true(torrent.is_auto_managed);
  }
});
test.serial('should get array of normalized torrent data', async (t) => {
  const deluge = new Deluge({ baseUrl });
  await setupTorrent(deluge);
  const res = await deluge.getAllData();
  t.is(res.torrents.length, 1);
  for (const torrent of res.torrents) {
    t.truthy(torrent.id);
    t.is(torrent.name, torrentName);
  }
});
test.serial('should get normalized torrent data', async (t) => {
  const deluge = new Deluge({ baseUrl });
  const res = await setupTorrent(deluge);
  const keys = Object.keys(res.result.torrents);
  for (const key of keys) {
    const torrent = await deluge.getTorrent(key);
    t.is(torrent.name, torrentName);
  }
});
test.serial('should move torrents in queue', async (t) => {
  const deluge = new Deluge({ baseUrl });
  const res = await setupTorrent(deluge);
  const key = Object.keys(res.result.torrents)[0];
  t.truthy(await deluge.queueUp(key));
  t.truthy(await deluge.queueDown(key));
  t.truthy(await deluge.queueTop(key));
  t.truthy(await deluge.queueBottom(key));
});
test.serial('should force recheck torrent', async (t) => {
  const deluge = new Deluge({ baseUrl });
  const res = await setupTorrent(deluge);
  const key = Object.keys(res.result.torrents)[0];
  t.truthy(await deluge.verifyTorrent(key));
});
test.serial('should update torrent trackers', async (t) => {
  const deluge = new Deluge({ baseUrl });
  const res = await setupTorrent(deluge);
  const key = Object.keys(res.result.torrents)[0];
  t.truthy(await deluge.updateTorrentTrackers(key));
});
test.serial('should add label', async (t) => {
  const client = new Deluge({ baseUrl });
  const list = await setupTorrent(client);
  const key = Object.keys(list.result.torrents)[0];
  await client.addLabel('swag');
  const res = await client.setTorrentLabel(key, 'swag');
  await client.removeLabel('swag');
  t.is(res.result, null);
});
test.serial('should pause/resume torrents', async (t) => {
  const deluge = new Deluge({ baseUrl });
  const res = await setupTorrent(deluge);
  const keys = Object.keys(res.result.torrents);
  for (const key of keys) {
    t.truthy(await deluge.pauseTorrent(key));
  }

  for (const key of keys) {
    t.truthy(await deluge.resumeTorrent(key));
  }
});
test.serial('should set torrent options', async (t) => {
  const deluge = new Deluge({ baseUrl });
  const res = await setupTorrent(deluge);
  const keys = Object.keys(res.result.torrents);
  for (const key of keys) {
    t.truthy(await deluge.setTorrentOptions(key, { max_download_speed: 22 }));
    t.truthy(await deluge.setTorrentOptions(key, { max_download_speed: 0 }));
  }
});
test.serial('should error when torrent hash does not exist', async (t) => {
  const client = new Deluge({ baseUrl });
  await t.throwsAsync(client.getTorrentStatus('abc123hash'));
});
test.serial('should return normalized torrent data', async (t) => {
  const client = new Deluge({ baseUrl });
  await setupTorrent(client);
  const res = await client.getAllData();
  const torrent = res.torrents[0];
  t.is(torrent.connectedPeers, 0);
  t.is(torrent.connectedSeeds, 0);
  t.is(torrent.downloadSpeed, 0);
  t.is(torrent.eta, 0);
  // expect(torrent.isCompleted).toBe(false);
  // expect(torrent.label).toBe(undefined);
  t.is(torrent.name, torrentName);
  t.assert(torrent.progress >= 0);
  t.is(torrent.queuePosition, 1);
  // expect(torrent.ratio).toBe(-1);
  // expect(torrent.savePath).toBe('/root/Downloads');
  // expect(torrent.state).toBe('checking');
  // expect(torrent.stateMessage).toBe('');
  t.is(torrent.totalDownloaded, 0);
  t.is(torrent.totalPeers, -1);
  t.is(torrent.totalSeeds, -1);
  t.is(torrent.totalSelected, 1953349632);
  // expect(torrent.totalSize).toBe(undefined);
  t.is(torrent.totalUploaded, 0);
  t.is(torrent.uploadSpeed, 0);
});
test.serial('should add torrent with normalized response', async (t) => {
  t.timeout(15000);
  const client = new Deluge({ baseUrl });

  // try adding label
  try {
    await client.addLabel('test');
  } catch {}

  const torrent = await client.normalizedAddTorrent(fs.readFileSync(torrentFile), {
    label: 'test',
  });
  t.assert(torrent.connectedPeers >= 0);
  t.assert(torrent.connectedSeeds >= 0);
  t.assert(torrent.downloadSpeed >= 0);
  t.assert(torrent.eta >= 0);
  // expect(torrent.isCompleted).toBe(false);
  // its setting the label but it takes an unknown number of seconds to save to db
  // expect(torrent.label).toBe('');
  t.is(torrent.name, torrentName);
  t.assert(torrent.progress >= 0);
  t.is(torrent.queuePosition, 1);
  // expect(torrent.ratio).toBe(-1);
  // expect(torrent.savePath).toBe('/downloads/');
  // expect(torrent.state).toBe(TorrentState.checking);
  // expect(torrent.stateMessage).toBe('');
  t.assert(torrent.totalDownloaded >= 0);
  t.is(torrent.totalPeers, -1);
  t.is(torrent.totalSeeds, -1);
  t.is(torrent.totalSelected, 1953349632);
  // expect(torrent.totalSize).toBe(undefined);
  t.assert(torrent.totalUploaded >= 0);
  t.assert(torrent.uploadSpeed >= 0);
});
test.serial('should add normalized torrent from magnet', async (t) => {
  const client = new Deluge({ baseUrl });
  const torrent = await client.normalizedAddTorrent(magnet);
  t.is(torrent.name, 'Ubuntu 11 10 Alternate Amd64 Iso');
});
test.serial.skip('should download from url', async (t) => {
  t.timeout(15000);
  const client = new Deluge({ baseUrl });
  const result = await client.downloadFromUrl(
    'https://releases.ubuntu.com/20.10/ubuntu-20.10-desktop-amd64.iso.torrent',
  );
  t.assert(result.includes('/tmp/'));
  await client.addTorrent(result, { add_paused: true });
  await pWaitFor(
    async () => {
      const r = await client.listTorrents();
      return Object.keys(r.result.torrents).length === 1;
    },
    { timeout: 10000 },
  );
  const res = await client.listTorrents();
  t.is(Object.keys(res.result.torrents).length, 1);
});
