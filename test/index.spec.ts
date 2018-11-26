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
