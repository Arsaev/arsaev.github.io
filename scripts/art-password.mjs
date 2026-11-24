import { pbkdf2Sync, randomBytes } from 'node:crypto';

// Read the password from stdin so it never appears in shell arguments.
let password = '';
for await (const chunk of process.stdin) password += chunk;
password = password.replace(/\r?\n$/, '');
if (!password) throw new Error('Provide a nonempty password on stdin.');
const salt = randomBytes(16).toString('hex');
const iterations = 600000;
console.log(JSON.stringify({ salt, iterations, hash: pbkdf2Sync(password, Buffer.from(salt, 'hex'), iterations, 32, 'sha256').toString('hex') }, null, 2));
