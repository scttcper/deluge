/* eslint-disable no-await-in-loop */
import { expect, beforeAll, afterEach, describe, it } from '@jest/globals';
import path from 'path';
import pWaitFor from 'p-wait-for';
import fs from 'fs';

import { Deluge } from '../src/index';
import { TorrentListResponse } from '../src/types';

const baseUrl = 'http://localhost:8112';
const torrentName = 'ubuntu-18.04.1-desktop-amd64.iso';
const torrentFile = path.join(__dirname, '/ubuntu-18.04.1-desktop-amd64.iso.torrent');
const torrentHash = 'e84213a794f3ccd890382a54a64ca68b7e925433';

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
  expect(Object.keys(res.result.torrents)).toHaveLength(1);
  return res;
}

describe('Deluge', () => {
  beforeAll(async () => {
    const deluge = new Deluge({ baseUrl });
    await deluge.enablePlugin(['Label']);
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
  it('should get plugins', async () => {
    const deluge = new Deluge({ baseUrl });
    const res = await deluge.getPlugins();
    expect(res.result.enabled_plugins.length).toBeGreaterThan(0);
    expect(res.result.available_plugins).toBeDefined();
    expect(res.result.available_plugins).toContain('Label');
  });
  it('should get plugins info', async () => {
    const deluge = new Deluge({ baseUrl });
    const res = await deluge.getPluginInfo(['Label']);
    expect(res.result.License).toBe('GPLv3');
  });
  it('should get version', async () => {
    const deluge = new Deluge({ baseUrl });
    const res = await deluge.getVersion();
    console.log({ version: res.result });
    expect(res.result.startsWith('2.0')).toBe(true);
  });
  // for some reason explodes deluge
  // it('should enable/disable plugins', async () => {
  //   const deluge = new Deluge({ baseURL });
  //   await deluge.enablePlugin(['Label']);
  //   const after = await deluge.getPlugins();
  //   expect(after.result.enabled_plugins).toEqual(['Label']);
  //   await deluge.disablePlugin(['Label']);
  // });
  it('should get config', async () => {
    const deluge = new Deluge({ baseUrl });
    const res = await deluge.getConfig();
    expect(res.result.dht).toBeDefined();
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
  it('should upload torrent from full path', async () => {
    const deluge = new Deluge({ baseUrl });
    const res = await deluge.upload(torrentFile);
    expect(res.files.length).toBe(1);
    expect(res.success).toBe(true);
  });
  it('should add torrent from file path string', async () => {
    const deluge = new Deluge({ baseUrl });
    const res = await deluge.addTorrent(torrentFile);
    expect(res.result[0][0]).toBe(true);
    expect(res.result[0][1]).toBe(torrentHash);
  });
  it('should add torrent from file buffer', async () => {
    const deluge = new Deluge({ baseUrl });
    const res = await deluge.addTorrent(fs.readFileSync(torrentFile));
    expect(res.result[0][0]).toBe(true);
    expect(res.result[0][1]).toBe(torrentHash);
  });
  it('should add torrent from file contents base64', async () => {
    const deluge = new Deluge({ baseUrl });
    const contents = Buffer.from(fs.readFileSync(torrentFile)).toString('base64');
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
    }
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
    // expect(torrent.isCompleted).toBe(false);
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
    expect(torrent.totalSelected).toBe(1953349632);
    // expect(torrent.totalSize).toBe(undefined);
    expect(torrent.totalUploaded).toBe(0);
    expect(torrent.uploadSpeed).toBe(0);
  });
  it('should add torrent with normalized response', async () => {
    const client = new Deluge({ baseUrl });

    // try adding label
    try {
      await client.addLabel('test');
    } catch {}

    const torrent = await client.normalizedAddTorrent(fs.readFileSync(torrentFile), {
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
    expect(torrent.totalSelected).toBe(1953349632);
    // expect(torrent.totalSize).toBe(undefined);
    expect(torrent.totalUploaded).toBeGreaterThanOrEqual(0);
    expect(torrent.uploadSpeed).toBeGreaterThanOrEqual(0);
  }, 15000);
});
