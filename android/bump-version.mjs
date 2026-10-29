#!/usr/bin/env node
/*
  Sets the version of the next Google Play release, and records released versions so a version code is never reused.

    node android/bump-version.mjs 1.0.1         next release: versionCode +1, versionName 1.0.1
    node android/bump-version.mjs --released    record the current version as uploaded to Play (do this after uploading)
    node android/bump-version.mjs --show        print the current version

  Then push to main: the "Android app bundle" workflow builds the new bundle on the android-build branch.
*/
import {readFile, writeFile} from 'node:fs/promises';

const MANIFEST = new URL('./twa-manifest.json', import.meta.url);
const HISTORY = new URL('./version-history.json', import.meta.url);
const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));
const history = JSON.parse(await readFile(HISTORY, 'utf8'));
const arg = process.argv[2];
const highest = Math.max(0, ...history.released.map(r => r.versionCode));
const save = async () => {
  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
  await writeFile(HISTORY, JSON.stringify(history, null, 2) + '\n');
};

if (!arg || arg === '--show') {
  console.log(`${manifest.packageId}: versionName ${manifest.appVersionName}, versionCode ${manifest.appVersionCode}`);
  console.log(`Highest version code already on Google Play: ${highest || 'none yet'}`);
} else if (arg === '--released') {
  if (history.released.some(r => r.versionCode === manifest.appVersionCode))
    throw new Error(`Version code ${manifest.appVersionCode} is already recorded as released.`);
  history.released.push({versionCode: manifest.appVersionCode, versionName: manifest.appVersionName, date: new Date().toISOString().slice(0, 10)});
  await save();
  console.log(`Recorded ${manifest.appVersionName} (${manifest.appVersionCode}) as released.`);
} else {
  if (!/^\d+\.\d+\.\d+$/.test(arg)) throw new Error('Use a version name like 1.0.1');
  const code = Math.max(manifest.appVersionCode, highest) + 1;
  manifest.appVersionCode = code;
  manifest.appVersionName = arg;
  manifest.appVersion = arg;
  await save();
  console.log(`Next release: versionName ${arg}, versionCode ${code}. Push to main to build it.`);
}
