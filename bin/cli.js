#!/usr/bin/env node

'use strict';

var bridge = require('..');
var program = require('commander');
var fs = require('fs');
var platform = require('os').platform();
var path = require('path');
var prompt = require('prompt');
var url = require('url');
var colors = require('colors/safe');
var through = require('through');
var storj = require('storj');
var os = require('os');

var HOME = platform !== 'win32' ? process.env.HOME : process.env.USERPROFILE;
var DATADIR = path.join(HOME, '.storjcli');
var KEYPATH = path.join(DATADIR, 'id_ecdsa');
var KEYRINGPATH = path.join(DATADIR, 'keyring');

if (!fs.existsSync(DATADIR)) {
  fs.mkdirSync(DATADIR);
}

prompt.message = colors.bold.cyan(' [...]');
prompt.delimiter = colors.cyan('  > ');

program.version(require('../package').version);
program.option('-u, --url <url>', 'set the base url for the api');
program.option('-k, --keypass <password>', 'unlock keyring without prompt');

function log(type, message, args) {
  switch (type) {
    case 'info':
      message = colors.bold.cyan(' [info]   ') + message;
      break;
    case 'warn':
      message = colors.bold.yellow(' [warn]   ') + message;
      break;
    case 'error':
      message = colors.bold.red(' [error]  ') + message;
      break;
  }

  console.log.apply(console, [message].concat(args || []));
}

function loadKeyPair() {
  if (!fs.existsSync(KEYPATH)) {
    log('error', 'You have not authenticated, please login.');
    process.exit();
  }

  return bridge.KeyPair(fs.readFileSync(KEYPATH).toString());
}

function PrivateClient() {
  return bridge.Client(program.url, {
    keypair: loadKeyPair()
  });
}

function PublicClient() {
  return bridge.Client(program.url);
}

function getKeyRing(callback) {
  if (program.keypass) {
    var keyring;

    try {
      keyring = storj.KeyRing(KEYRINGPATH, program.keypass);
    } catch (err) {
      return log('error', 'Could not unlock keyring, bad password?');
    }

    return callback(keyring);
  }

  var description = fs.existsSync(KEYRINGPATH) ?
                    'Enter your passphrase to unlock your keyring' :
                    'Enter a passphrase to protect your keyring';

  prompt.start();
  prompt.get({
    properties: {
      passphrase: {
        description: description,
        replace: '*',
        hidden: true,
        default: ''
      }
    }
  }, function(err, result) {
    if (err) {
      return log('error', err.message);
    }

    var keyring;

    try {
      keyring = storj.KeyRing(KEYRINGPATH, result.passphrase);
    } catch (err) {
      return log('error', 'Could not unlock keyring, bad password?');
    }

    callback(keyring);
  });
}

function getCredentials(callback) {
  prompt.start();
  prompt.get({
    properties: {
      email: {
        description: 'Enter your email address',
        required: true
      },
      password: {
        description: 'Enter your password',
        required: true,
        replace: '*',
        hidden: true
      }
    }
  }, callback);
}

var ACTIONS = {
  getinfo: function getinfo() {
    PublicClient().getInfo().then(function(info) {
      log('info', 'Title:        %s', info.info.title);
      log('info', 'Description:  %s', info.info.description);
      log('info', 'Version:      %s', info.info.version);
      log('info', 'Network Seed: %s', info.info['x-network-seed']);
      log('info', 'Host:         %s', info.host);
    }, function(err) {
      log('error', err.message);
    });
  },
  register: function register() {
    getCredentials(function(err, result) {
      if (err) {
        return log('error', err.message);
      }

      PublicClient().createUser(
        result.email, result.password
      ).then(function() {
        log('info', 'Registered! Check your email to activate your account.');
      }, function(err) {
        log('error', err.message);
      });
    });
  },
  login: function login() {
    if (fs.existsSync(KEYPATH)) {
      return log('error', 'This device is already paired.');
    }

    getCredentials(function(err, result) {
      if (err) {
        return log('error', err.message);
      }

      var client = bridge.Client(program.url, {
        basicauth: result
      });
      var keypair = bridge.KeyPair();

      client.addPublicKey(keypair.getPublicKey()).then(function(result) {
        fs.writeFileSync(KEYPATH, keypair.getPrivateKey());
        log('info', 'This device has been successfully paired.');
      }, function(err) {
        log('error', err.message);
      });
    });
  },
  logout: function logout() {
    var keypair = loadKeyPair();

    PrivateClient().destroyPublicKey(keypair.getPublicKey()).then(function() {
      fs.unlinkSync(KEYPATH);
      log('info', 'This device has been successfully unpaired.');
    }, function(err) {
      fs.unlinkSync(KEYPATH);
      log('info', 'This device has been successfully unpaired.');
      log('warn', 'Failed to revoke key, you may need to do it manually.');
      log('warn', 'Reason: ' + err.message);
    });
  },
  listkeys: function listkeys() {
    PrivateClient().getPublicKeys().then(function(keys) {
      keys.forEach(function(key) {
        log('info', key.key);
      });
    }, function(err) {
      log('error', err.message);
    });
  },
  addkey: function addkey(pubkey) {
    PrivateClient().addPublicKey(pubkey).then(function() {
      log('info', 'Key successfully registered.');
    }, function(err) {
      log('error', err.message);
    });
  },
  removekey: function removekey(pubkey) {
    PrivateClient().destroyPublicKey(pubkey).then(function() {
      log('info', 'Key successfully revoked.');
    }, function(err) {
      log('error', err.message);
    });
  },
  listbuckets: function listbuckets() {
    PrivateClient().getBuckets().then(function(buckets) {
      if (!buckets.length) {
        return log('warn', 'You have not created any buckets.');
      }

      buckets.forEach(function(bucket) {
        log(
          'info',
          'ID: %s, Name: %s, Storage: %s, Transfer: %s',
          [bucket.id, bucket.name, bucket.storage, bucket.transfer]
        );
      });
    }, function(err) {
      log('error', err.message);
    });
  },
  getbucket: function showbucket(id) {
    PrivateClient().getBucketById(id).then(function(bucket) {
      log(
        'info',
        'ID: %s, Name: %s, Storage: %s, Transfer: %s',
        [bucket.id, bucket.name, bucket.storage, bucket.transfer]
      );
    }, function(err) {
      log('error', err.message);
    });
  },
  removebucket: function removebucket(id) {
    PrivateClient().destroyBucketById(id).then(function() {
      log('info', 'Bucket successfully destroyed.');
    }, function(err) {
      log('error', err.message);
    });
  },
  addbucket: function addbucket(name, storage, transfer) {
    PrivateClient().createBucket({
      name: name,
      storage: storage,
      transfer: transfer
    }).then(function(bucket) {
      log(
        'info',
        'ID: %s, Name: %s, Storage: %s, Transfer: %s',
        [bucket.id, bucket.name, bucket.storage, bucket.transfer]
      );
    }, function(err) {
      log('error', err.message);
    });
  },
  updatebucket: function updatebucket(id, name, storage, transfer) {
    PrivateClient().updateBucketById(id, {
      name: name,
      storage: storage,
      transfer: transfer
    }).then(function(bucket) {
      log(
        'info',
        'ID: %s, Name: %s, Storage: %s, Transfer: %s',
        [bucket.id, bucket.name, bucket.storage, bucket.transfer]
      );
    }, function(err) {
      log('error', err.message);
    });
  },
  listfiles: function listfiles(id) {
    PrivateClient().listFilesInBucket(id).then(function(files) {
      if (!files.length) {
        return log('warn', 'There are not files in this bucket.');
      }

      files.forEach(function(file) {
        log(
          'info',
          'Name: %s, Type: %s, Size: %s bytes, ID: %s',
          [file.filename, file.mimetype, file.size, file.id]
        );
      });
    }, function(err) {
      log('error', err.message);
    });
  },
  removefile: function removefile(id, fileId) {
    PrivateClient().removeFileFromBucket(id, fileId).then(function() {
      log('info', 'File was successfully removed from bucket.');
    }, function(err) {
      log('error', err.message);
    });
  },
  uploadfile: function uploadfile(bucket, filepath) {
    if (!fs.existsSync(filepath)) {
      return log('error', 'No file found at %s', filepath);
    }

    var secret = new storj.KeyPair();
    var padder = new storj.Padder();
    var encrypter = new storj.EncryptStream(secret);
    var tmppath = path.join(os.tmpdir(), path.basename(filepath));

    function cleanup() {
      log('info', 'Cleaning up...');
      fs.unlinkSync(tmppath);
    }

    getKeyRing(function(keyring) {
      log('info', 'Generating encryption key...');
      log('info', 'Encrypting file "%s"', [filepath]);

      fs.createReadStream(filepath)
        .pipe(padder)
        .pipe(encrypter)
        .pipe(fs.createWriteStream(tmppath)).on('finish', function() {
          log('info', 'Encryption complete!');
          log('info', 'Creating storage token...');
          PrivateClient().createToken(bucket, 'PUSH').then(function(token) {
            log('info', 'Storing file, hang tight!');
            PrivateClient().storeFileInBucket(
              bucket,
              token.token,
              tmppath
            ).then(function(file) {
              keyring.set(file.id, secret);
              cleanup();
              log('info', 'Encryption key saved to keyring.');
              log('info', 'File successfully stored in bucket.');
              log(
                'info',
                'Name: %s, Type: %s, Size: %s bytes, ID: %s',
                [file.filename, file.mimetype, file.size, file.id]
              );

            }, function(err) {
              cleanup();
              log('error', err.message);
            });
          }, function(err) {
            cleanup();
            log('error', err.message);
          });
        }
      );
    });
  },
  getpointer: function getpointer(bucket, id) {
    PrivateClient().createToken(bucket, 'PULL').then(function(token) {
      PrivateClient().getFilePointer(
        bucket,
        token.token,
        id
      ).then(function(pointer) {
        pointer.forEach(function(location) {
          log(
            'info',
            'Hash: %s, Token: %s, Farmer: %j',
            [location.hash, location.token, location.farmer]
          );
        });
      }, function(err) {
        log('error', err.message);
      });
    }, function(err) {
      log('error', err.message);
    });
  },
  addframe: function addframe() {
    PrivateClient().createFileStagingFrame().then(function(frame) {
      log('info', 'ID: %s, Created: %s', [frame.id, frame.created]);
    }, function(err) {
      log('error', err.message);
    });
  },
  listframes: function listframes() {
    PrivateClient().getFileStagingFrames().then(function(frames) {
      if (!frames.length) {
        return log('warn', 'There are no frames to list.');
      }

      frames.forEach(function(frame) {
        log(
          'info',
          'ID: %s, Created: %s, Shards: %s',
          [frame.id, frame.created, frame.shards.length]
        );
      });
    }, function(err) {
      log('error', err.message);
    });
  },
  getframe: function getframe(frame) {
    PrivateClient().getFileStagingFrameById(frame).then(function(frame) {
      log(
        'info',
        'ID: %s, Created: %s, Shards: %s',
        [frame.id, frame.created, frame.shards.length]
      );
    }, function(err) {
      log('error', err.message);
    });
  },
  removeframe: function removeframe(frame) {
    PrivateClient().destroyFileStagingFrameById(frame).then(function() {
      log('info', 'Frame was successfully removed.');
    }, function(err) {
      log('error', err.message);
    });
  },
  downloadfile: function downloadfile(bucket, id, filepath) {
    if (fs.existsSync(filepath)) {
      return log('error', 'Refusing to overwrite file at %s', filepath);
    }

    getKeyRing(function(keyring) {
      log('info', 'Creating retrieval token...');
      PrivateClient().createToken(bucket, 'PULL').then(function(token) {
        log('info', 'Resolving file pointer...');
        PrivateClient().getFilePointer(
          bucket,
          token.token,
          id
        ).then(function(pointer) {
          log('info', 'Downloading file from %s channels...', [pointer.length]);
          var target = fs.createWriteStream(filepath);
          var secret = keyring.get(id);

          if (!secret) {
            return log('error', 'No decryption key found in key ring!');
          }

          var unpadder = new storj.Unpadder();
          var decrypter = new storj.DecryptStream(secret);

          target.on('finish', function() {
            log('info', 'File downloaded and written to %s.', [filepath]);
          }).on('error', function(err) {
            log('error', err.message);
          });

          PrivateClient().resolveFileFromPointers(pointer).then(function(stream) {
            stream.on('error', function(err) {
              log('error', err.message);
            }).pipe(through(function(chunk) {
              log('info', 'Received %s bytes of data', [chunk.length]);
              this.queue(chunk);
            })).pipe(decrypter).pipe(unpadder).pipe(target);
          }, function(err) {
            log('error', err.message);
          });
        }, function(err) {
          log('error', err.message);
        });
      }, function(err) {
        log('error', err.message);
      });
    });
  },
  createtoken: function createtoken(bucket, operation) {
    PrivateClient().createToken(bucket, operation).then(function(token) {
      log('info', 'Token successfully created.');
      log(
        'info',
        'Token: %s, Bucket: %s, Operation: %s',
        [token.token, token.bucket, token.operation]
      );
    }, function(err) {
      log('error', err.message);
    });
  },
  streamfile: function downloadfile(bucket, id) {
    getKeyRing(function(keyring) {
      var secret = keyring.get(id);

      if (!secret) {
        return log('error', 'No decryption key found in key ring!');
      }

      var decrypter = new storj.DecryptStream(secret);
      var unpadder = new storj.Unpadder();

      PrivateClient().createToken(bucket, 'PULL').then(function(token) {
        PrivateClient().getFilePointer(
          bucket,
          token.token,
          id
        ).then(function(pointer) {
          PrivateClient().resolveFileFromPointers(
            pointer
          ).then(function(stream) {
            stream.pipe(decrypter).pipe(unpadder).pipe(process.stdout);
          }, function(err) {
            process.stderr.write(err.message);
          });
        }, function(err) {
          process.stderr.write(err.message);
        });
      }, function(err) {
        process.stderr.write(err.message);
      });
    });
  },
  resetkeyring: function resetkeyring() {
    getKeyRing(function(keyring) {
      prompt.start();
      prompt.get({
        properties: {
          passphrase: {
            description: 'Enter a new password for your keyring',
            replace: '*',
            hidden: true,
            default: ''
          }
        }
      }, function(err, result) {
        if (err) {
          return log('error', err.message);
        }

        keyring._pass = result.passphrase;
        keyring._saveKeyRingToDisk();
        log('info', 'Password for keyring has been reset.');
      });
    });
  },
  listcontacts: function listcontacts(page) {
    PublicClient().getContactList({
      page: page,
      connected: this.connected
    }).then(function(contacts) {
      if (!contacts.length) {
        return log('warn', 'There are no contacts to show');
      }

      contacts.forEach(function(contact) {
        log('info', 'Contact:   ' + storj.utils.getContactURL(contact));
        log('info', 'Last Seen: ' + contact.lastSeen);
        log('info', 'Protocol:  ' + (contact.protocol || '?'));
        log('info', '');
      });
    }, function(err) {
      log('error', err.message);
    });
  },
  getcontact: function getcontact(nodeid) {
    PublicClient().getContactByNodeId(nodeid).then(function(contact) {
      log('info', 'Contact:   ' + storj.utils.getContactURL(contact));
      log('info', 'Last Seen: ' + contact.lastSeen);
      log('info', 'Protocol:  ' + (contact.protocol || '?'));
    }, function(err) {
      log('error', err.message);
    });
  }
};

program
  .command('getinfo')
  .description('get remote api information')
  .action(ACTIONS.getinfo);

program
  .command('register')
  .description('register a new account with the storj api')
  .action(ACTIONS.register);

program
  .command('login')
  .description('authorize this device to access your storj api account')
  .action(ACTIONS.login);

program
  .command('logout')
  .description('revoke this device\'s access your storj api account')
  .action(ACTIONS.logout);

program
  .command('listkeys')
  .description('list your registered public keys')
  .action(ACTIONS.listkeys);

program
  .command('addkey <pubkey>')
  .description('register the given public key')
  .action(ACTIONS.addkey);

program
  .command('removekey <pubkey>')
  .description('invalidates the registered public key')
  .action(ACTIONS.removekey);

program
  .command('listbuckets')
  .description('list your storage buckets')
  .action(ACTIONS.listbuckets);

program
  .command('getbucket <id>')
  .description('get specific storage bucket information')
  .action(ACTIONS.getbucket);

program
  .command('addbucket [name] [storage] [transfer]')
  .description('create a new storage bucket')
  .action(ACTIONS.addbucket);

program
  .command('removebucket <id>')
  .description('destroys a specific storage bucket')
  .action(ACTIONS.removebucket);

program
  .command('updatebucket <id> [name] [storage] [transfer]')
  .description('updates a specific storage bucket')
  .action(ACTIONS.updatebucket);

program
  .command('addframe')
  .description('creates a new file staging frame')
  .action(ACTIONS.addframe);

program
  .command('listframes')
  .description('lists your file staging frames')
  .action(ACTIONS.listframes);

program
  .command('getframe <id>')
  .description('retreives the file staging frame by id')
  .action(ACTIONS.getframe);

program
  .command('removeframe <id>')
  .description('removes the file staging frame by id')
  .action(ACTIONS.removeframe);

program
  .command('listfiles <bucket>')
  .description('list the files in a specific storage bucket')
  .action(ACTIONS.listfiles);

program
  .command('removefile <bucket> <id>')
  .description('delete a file pointer from a specific bucket')
  .action(ACTIONS.removefile);

program
  .command('uploadfile <bucket> <filepath>')
  .description('upload a file to the network and track in a bucket')
  .action(ACTIONS.uploadfile);

program
  .command('downloadfile <bucket> <id> <filepath>')
  .description('download a file from the network with a pointer from a bucket')
  .action(ACTIONS.downloadfile);

program
  .command('streamfile <bucket> <id>')
  .description('stream a file from the network and write to stdout')
  .action(ACTIONS.streamfile);

program
  .command('getpointer <bucket> <id>')
  .description('get pointer metadata for a file in a bucket')
  .action(ACTIONS.getpointer);

program
  .command('createtoken <bucket> <operation>')
  .description('create a push or pull token for a file')
  .action(ACTIONS.getfile);

program
  .command('listcontacts [page]')
  .option('-c, --connected', 'limit results to connected nodes')
  .description('list the peers known to the remote bridge')
  .action(ACTIONS.listcontacts);

program
  .command('getcontact <nodeid>')
  .description('get the contact information for a given node id')
  .action(ACTIONS.getcontact);

program
  .command('resetkeyring')
  .description('reset the keyring password')
  .action(ACTIONS.resetkeyring);

program.parse(process.argv);

if (process.argv.length < 3) {
  return program.help();
}

var firstArg = program.args[program.args.length - 1]._name;
var commandIsUnknown = typeof firstArg === 'undefined';

if (commandIsUnknown) {
  return log(
    'error',
    'Unknown option \'%s\', please use --help for assistance',
    program.args[0]
  );
}
