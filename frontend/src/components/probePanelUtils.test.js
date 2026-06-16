import test from 'node:test';
import assert from 'node:assert/strict';
import { copyIpWith } from './probePanelUtils.js';

// ── Tests ────────────────────────────────────────────────────

test('copyIpWith writes IP to clipboard and fires toast', () => {
  const clip = [];
  const toasts = [];

  const fakeClipboard = { writeText: (s) => clip.push(s) };
  const fakeToast = (msg, type, dur) => toasts.push({ msg, type, dur });

  copyIpWith('107.174.139.43', fakeClipboard, fakeToast);

  assert.equal(clip[0], '107.174.139.43');
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].msg, 'IP 已复制: 107.174.139.43');
  assert.equal(toasts[0].type, 'success');
  assert.equal(toasts[0].dur, 2000);
});

test('copyIpWith handles IPv6 addresses', () => {
  const clip = [];
  const toasts = [];

  copyIpWith('2001:db8::1', { writeText: (s) => clip.push(s) }, (msg, type, dur) => toasts.push({ msg, type, dur }));

  assert.equal(clip[0], '2001:db8::1');
  assert.equal(toasts[0].msg, 'IP 已复制: 2001:db8::1');
});

test('copyIpWith handles empty string without crashing', () => {
  const clip = [];
  let called = false;
  copyIpWith('', { writeText: (s) => { clip.push(s); called = true; } }, () => {});
  assert.equal(called, true);
  assert.equal(clip[0], '');
});
