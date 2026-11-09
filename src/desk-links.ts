import fs from 'node:fs';
import path from 'node:path';
import { sharedProjectFile } from './http.ts';

/** Turn a clicked link into a window, without expanding what the file server exposes. */
export function linkPanel(root: string, href: string, base: string) {
  if (!href.trim() || href.length > 8192) throw Object.assign(new Error('Invalid link'), { status: 400 });
  const url = new URL(href, base);
  if (!['http:', 'https:'].includes(url.protocol)) throw Object.assign(new Error('Unsupported link'), { status: 400 });
  const localFile = url.origin === new URL(base).origin && url.pathname.startsWith('/files/');
  if (!localFile && /^(?:https?:)?\/\//i.test(href)) {
    return { kind: 'browser', title: url.hostname, url: url.href, link: url.href, remember: false, dialogs: false, span: 6, height: 520 };
  }
  const relative = decodeURIComponent(localFile ? url.pathname.slice('/files/'.length) : href.split(/[?#]/)[0]);
  const file = sharedProjectFile(root, relative);
  if (!fs.statSync(file).isFile()) throw Object.assign(new Error('This link is not a file'), { status: 400 });
  const source = path.relative(root, file).split(path.sep).join('/');
  const address = '/files/' + source.split('/').map(encodeURIComponent).join('/');
  const common = { title: path.basename(file), link: address, span: 6, height: 440 };
  return /\.(?:md|markdown)$/i.test(file)
    ? { ...common, kind: 'markdown', source, href: address }
    : { ...common, kind: 'browser', url: new URL(address, base).href, remember: false, dialogs: false };
}
