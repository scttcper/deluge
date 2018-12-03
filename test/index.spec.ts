import path from 'path';
import pWaitFor from 'p-wait-for';

import { Deluge } from '../src/index';

const baseURL = 'http://localhost:8112/';
const torrentFile = path.join(__dirname + '/ubuntu-18.04.1-desktop-amd64.iso.torrent');

describe('Deluge', () => {
  it('should be instantiable', async () => {
    const deluge = new Deluge({ baseURL });
    expect(deluge).toBeTruthy();
    // expect(deluge.cookie).toBeDefined();
    // expect(deluge.cookie && deluge.cookie.validate()).toBe(true);
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
  it('should login', async () => {
    const deluge = new Deluge({ baseURL });
    const success = await deluge.login();
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
  });
  it('should list methods', async () => {
    const deluge = new Deluge({ baseURL });
    const methods = await deluge.listMethods();
    expect(Array.isArray(methods.result)).toEqual(true);
    expect(methods.result.length).toEqual(88);
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
  it('should list torrents', async () => {
    const deluge = new Deluge({ baseURL });
    await deluge.addTorrent(torrentFile);
    await pWaitFor(
      async () => {
        const r = await deluge.listTorrents();
        return Object.keys(r.result.torrents).length === 1;
      },
      { timeout: 10000 },
    );
    const res = await deluge.listTorrents();
    expect(res.result.torrents).toBeDefined();
    const keys = Object.keys(res.result.torrents);
    expect(keys.length).toEqual(1);
    for (const key of keys) {
      const torrent = res.result.torrents[key];
      expect(torrent.is_auto_managed).toBe(true);
    }
  });
});
