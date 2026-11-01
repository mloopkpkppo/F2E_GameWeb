import test from 'node:test';
import assert from 'node:assert/strict';
import { pageFor, slideDirection } from './navigation.js';

test('page routes accept existing HTML links but leave authentication and API requests alone', () => {
  assert.equal(pageFor('/games').name, 'games');
  assert.equal(pageFor('/indie.html').path, '/indie');
  assert.equal(pageFor('/deals/').path, '/deals');
  assert.equal(pageFor('/index.html').name, 'home');
  assert.equal(pageFor('/auth/steam'), null);
  assert.equal(pageFor('/auth/steam/logout'), null);
  assert.equal(pageFor('/api/me'), null);
  assert.equal(pageFor('/games/index.html'), null);
  assert.equal(pageFor('/not-a-page'), null);
});

test('content slides in the direction of the selected menu item', () => {
  assert.equal(slideDirection(pageFor('/games'), pageFor('/deals')), 1);
  assert.equal(slideDirection(pageFor('/deals'), pageFor('/games')), -1);
  assert.equal(slideDirection(pageFor('/games'), pageFor('/games')), 1);
});
