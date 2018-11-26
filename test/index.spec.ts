import { Deluge } from '../src/index';
import path from 'path';

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
    const res = await deluge.connected();
    expect(typeof res).toBe('boolean');
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
});
