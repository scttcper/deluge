# deluge [![npm](https://img.shields.io/npm/v/@ctrl/deluge.svg?maxAge=3600)](https://www.npmjs.com/package/@ctrl/deluge) [![build status](https://travis-ci.com/TypeCtrl/deluge.svg?branch=master)](https://travis-ci.org/typectrl/deluge) [![coverage status](https://codecov.io/gh/typectrl/deluge/branch/master/graph/badge.svg)](https://codecov.io/gh/typectrl/deluge)

> TypeScript api wrapper for [deluge](https://deluge-torrent.org/) using [got](https://github.com/sindresorhus/got)

### Install

```bash
npm install @ctrl/deluge
```

### Use

```ts
import { Deluge } from '@ctrl/deluge';

const deluge = new Deluge({
  baseURL: 'http://localhost:8112/',
  password: 'deluge',
});

async function main() {
  const res = await deluge.listTorrents();
  console.log(res.result);
}
```
