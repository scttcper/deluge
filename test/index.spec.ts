import path from 'path';
import pWaitFor from 'p-wait-for';

import { Deluge } from '../src/index';

const baseURL = 'http://localhost:8112/';
const torrentFile = path.join(__dirname + '/ubuntu-18.04.1-desktop-amd64.iso.torrent');

async function setupTorrent(deluge: Deluge) {
  await deluge.addTorrent(torrentFile);
  await pWaitFor(
    async () => {
      const r = await deluge.listTorrents();
      return Object.keys(r.result.torrents).length === 1;
    },
    { timeout: 10000 },
  );
  const res = await deluge.listTorrents();
  expect(Object.keys(res.result.torrents).length).toEqual(1);
  return res;
}

describe('Deluge', () => {
  afterEach(async () => {
    const deluge = new Deluge({ baseURL });
    const torrents = await deluge.listTorrents();
    const ids = Object.keys(torrents.result.torrents);
    for (const id of ids) {
      // clean up all torrents
      await deluge.removeTorrent(id, false);
    }
  });
  it('should be instantiable', async () => {
    const deluge = new Deluge({ baseURL });
    expect(deluge).toBeTruthy();
  });
  it('should disconnect', async () => {
    const deluge = new Deluge({ baseURL });
    await deluge.connect();
    const res = await deluge.disconnect();
    expect(res).toBe(true);
  });
  it('should connect', async () => {
    const deluge = new Deluge({ baseURL });
    const res = await deluge.connect();
    expect(res.result).toBe(null);
  });
  it('should get plugins', async () => {
    const deluge = new Deluge({ baseURL });
    const res = await deluge.getPlugins();
    expect(res.result.enabled_plugins).toEqual([]);
    expect(res.result.available_plugins).toBeDefined();
    expect(res.result.available_plugins).toEqual([
      'Extractor',
      'Execute',
      'Blocklist',
      'AutoAdd',
      'Label',
      'Notifications',
      'WebUi',
      'Scheduler',
    ]);
  });
  it('should get plugins info', async () => {
    const deluge = new Deluge({ baseURL });
    const res = await deluge.getPluginInfo(['Label']);
    expect(res.result.License).toEqual('GPLv3');
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
    const deluge = new Deluge({ baseURL });
    const res = await deluge.getConfig();
    expect(res.result.dht).toBeDefined();
  });
  it('should set config', async () => {
    const deluge = new Deluge({ baseURL });
    const startConfig = await deluge.getConfig();
    expect(startConfig.result.upnp).toBe(true);
    await deluge.setConfig({ upnp: false });
    const res = await deluge.getConfig();
    expect(res.result.upnp).toBe(false);
    await deluge.setConfig({ upnp: true });
  });
  it('should login', async () => {
    const deluge = new Deluge({ baseURL });
    const success = await deluge.login();
    expect(success).toBe(true);
  });
  it('should logout', async () => {
    const deluge = new Deluge({ baseURL });
    await deluge.login();
    const success = await deluge.logout();
    expect(success).toBe(true);
  });
  it('should change password', async () => {
    const deluge = new Deluge({ baseURL });
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
    // tslint:disable-next-line no-floating-promises
    expect(deluge.changePassword('shouldfail')).rejects.toThrowError();
  });
  it('should list methods', async () => {
    const deluge = new Deluge({ baseURL });
    const methods = await deluge.listMethods();
    expect(Array.isArray(methods.result)).toEqual(true);
    expect(methods.result.length).toBeGreaterThanOrEqual(88);
  });
  it('should upload torrent from full path', async () => {
    const deluge = new Deluge({ baseURL });
    const res = await deluge.upload(torrentFile);
    expect(res.files.length).toBe(1);
    expect(res.success).toBe(true);
  });
  it('should add torrent', async () => {
    const deluge = new Deluge({ baseURL });
    const res = await deluge.addTorrent(torrentFile);
    expect(res.result).toBe(true);
  });
  it('should get torrent status', async () => {
    const deluge = new Deluge({ baseURL });
    const res = await setupTorrent(deluge);
    const keys = Object.keys(res.result.torrents);
    for (const key of keys) {
      const status = await deluge.getTorrentStatus(key);
      expect(status.result.name).toEqual('ubuntu-18.04.1-desktop-amd64.iso');
    }
  });
  it('should list torrents', async () => {
    const deluge = new Deluge({ baseURL });
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
  it('should move torrents in queue', async () => {
    const deluge = new Deluge({ baseURL });
    const res = await setupTorrent(deluge);
    const key = Object.keys(res.result.torrents)[0];
    await deluge.queueUp(key);
    await deluge.queueDown(key);
    await deluge.queueTop(key);
    await deluge.queueBottom(key);
  });
  it('should force recheck torrent', async () => {
    const deluge = new Deluge({ baseURL });
    const res = await setupTorrent(deluge);
    const key = Object.keys(res.result.torrents)[0];
    await deluge.forceRecheck(key);
  });
  it('should pause/resume torrents', async () => {
    const deluge = new Deluge({ baseURL });
    const res = await setupTorrent(deluge);
    const keys = Object.keys(res.result.torrents);
    for (const key of keys) {
      await deluge.pauseTorrent(key);
      await deluge.resumeTorrent(key);
    }
  });
  it('should set torrent options', async () => {
    const deluge = new Deluge({ baseURL });
    const res = await setupTorrent(deluge);
    const keys = Object.keys(res.result.torrents);
    for (const key of keys) {
      await deluge.setTorrentOptions(key, { max_download_speed: 22 });
      await deluge.setTorrentOptions(key, { max_download_speed: 0 });
    }
  });
});
