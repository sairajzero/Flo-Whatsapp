window.indexedDB = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
window.IDBTransaction = window.IDBTransaction || window.webkitIDBTransaction || window.msIDBTransaction;
window.IDBKeyRange = window.IDBKeyRange || window.webkitIDBKeyRange || window.msIDBKeyRange;

if (!window.indexedDB) {
  window.alert("Your browser doesn't support a stable version of IndexedDB.")
}

var contacts, groups;
var searchIndex = new FlexSearch();
var receiverID, selfID, recStat, modSuperNode, msgType;
var selfwebsocket, receiverWebSocket;
var privKey;

var floOpt = {

  p: BigInteger("FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F", 16),

  exponent1: function () {
    return floOpt.p.add(BigInteger.ONE).divide(BigInteger("4"))
  },

  calculateY: function (x) {
    let p = this.p;
    let exp = this.exponent1();
    // x is x value of public key in BigInteger format without 02 or 03 or 04 prefix
    return x.modPow(BigInteger("3"), p).add(BigInteger("7")).mod(p).modPow(exp, p)
  },

  // Insert a compressed public key
  getUncompressedPublicKey: function (compressedPublicKey) {

    const p = this.p;

    // Fetch x from compressedPublicKey
    let pubKeyBytes = Crypto.util.hexToBytes(compressedPublicKey);
    const prefix = pubKeyBytes.shift() // remove prefix
    let prefix_modulus = prefix % 2;
    pubKeyBytes.unshift(0) // add prefix 0
    let x = new BigInteger(pubKeyBytes)
    let xDecimalValue = x.toString()

    // Fetch y
    let y = this.calculateY(x);
    let yDecimalValue = y.toString();

    // verify y value
    let resultBigInt = y.mod(BigInteger("2"));

    let check = resultBigInt.toString() % 2;

    if (prefix_modulus !== check) {
      yDecimalValue = y.negate().mod(p).toString();
    }

    return {
      x: xDecimalValue,
      y: yDecimalValue
    };
  },

  getSenderPublicKeyString: function () {
    privateKey = ellipticCurveEncryption.senderRandom();
    senderPublicKeyString = ellipticCurveEncryption.senderPublicString(privateKey);
    return {
      privateKey: privateKey,
      senderPublicKeyString: senderPublicKeyString
    }
  },

  deriveSharedKeySender: function (receiverCompressedPublicKey, senderPrivateKey) {
    try {
      let receiverPublicKeyString = this.getUncompressedPublicKey(receiverCompressedPublicKey);
      var senderDerivedKey = ellipticCurveEncryption.senderSharedKeyDerivation(
        receiverPublicKeyString.x, receiverPublicKeyString.y, senderPrivateKey);
      return senderDerivedKey;
    } catch (error) {
      return new Error(error);
    }
  },

  deriveReceiverSharedKey: function (senderPublicKeyString, receiverPrivateKey) {
    return ellipticCurveEncryption.receiverSharedKeyDerivation(
      senderPublicKeyString.XValuePublicString, senderPublicKeyString.YValuePublicString,
      receiverPrivateKey);
  },

  getReceiverPublicKeyString: function (privateKey) {
    return ellipticCurveEncryption.receiverPublicString(privateKey);
  },

  deriveSharedKeyReceiver: function (senderPublicKeyString, receiverPrivateKey) {
    try {
      return ellipticCurveEncryption.receiverSharedKeyDerivation(senderPublicKeyString.XValuePublicString,
        senderPublicKeyString.YValuePublicString, receiverPrivateKey);

    } catch (error) {
      return new Error(error);
    }
  },

  encryptData: function (data, receiverCompressedPublicKey) {
    var senderECKeyData = this.getSenderPublicKeyString();
    var senderDerivedKey = this.deriveSharedKeySender(receiverCompressedPublicKey, senderECKeyData.privateKey);
    let senderKey = senderDerivedKey.XValue + senderDerivedKey.YValue;
    let secret = Crypto.AES.encrypt(data, senderKey);
    return {
      secret: secret,
      senderPublicKeyString: senderECKeyData.senderPublicKeyString
    };
  },

  decryptData: function (data, myPrivateKey) {
    var receiverECKeyData = {};
    if (typeof myPrivateKey !== "string") throw new Error("No private key found.");

    let privateKey = this.wifToDecimal(myPrivateKey, true);
    if (typeof privateKey.privateKeyDecimal !== "string") throw new Error(
      "Failed to detremine your private key.");
    receiverECKeyData.privateKey = privateKey.privateKeyDecimal;

    var receiverDerivedKey = this.deriveReceiverSharedKey(data.senderPublicKeyString, receiverECKeyData.privateKey);
    console.log("receiverDerivedKey", receiverDerivedKey);

    let receiverKey = receiverDerivedKey.XValue + receiverDerivedKey.YValue;
    let decryptMsg = Crypto.AES.decrypt(data.secret, receiverKey);
    return decryptMsg;
  },

  ecparams: EllipticCurve.getSECCurveByName("secp256k1"),
  getPubKeyHex: function (privateKeyHex) {
    var key = new Bitcoin.ECKey(privateKeyHex);
    if (key.priv == null) {
      alert("Invalid Private key");
      return;
    }
    key.setCompressed(true);
    var pubkeyHex = key.getPubKeyHex();
    return pubkeyHex;
  },
  getFloIDfromPubkeyHex: function (pubkeyHex) {
    var key = new Bitcoin.ECKey().setPub(pubkeyHex);
    var floID = key.getBitcoinAddress();
    return floID;
  },
  signData: function (data, privateKeyHex) {
    var key = new Bitcoin.ECKey(privateKeyHex);
    key.setCompressed(true);

    var privateKeyArr = key.getBitcoinPrivateKeyByteArray();
    privateKey = BigInteger.fromByteArrayUnsigned(privateKeyArr);
    var messageHash = Crypto.SHA256(data);

    var messageHashBigInteger = new BigInteger(messageHash);
    var messageSign = Bitcoin.ECDSA.sign(messageHashBigInteger, key.priv);

    var sighex = Crypto.util.bytesToHex(messageSign);
    return sighex;
  },
  verifyData: function (data, signatureHex, publicKeyHex) {
    var msgHash = Crypto.SHA256(data);
    var messageHashBigInteger = new BigInteger(msgHash);

    var sigBytes = Crypto.util.hexToBytes(signatureHex);
    var signature = Bitcoin.ECDSA.parseSig(sigBytes);

    var publicKeyPoint = this.ecparams.getCurve().decodePointHex(publicKeyHex);

    var verify = Bitcoin.ECDSA.verifyRaw(messageHashBigInteger, signature.r, signature.s,
      publicKeyPoint);
    return verify;
  },
  wifToDecimal: function (pk_wif, isPubKeyCompressed = false) {
    let pk = Bitcoin.Base58.decode(pk_wif)
    pk.shift()
    pk.splice(-4, 4)
    //If the private key corresponded to a compressed public key, also drop the last byte (it should be 0x01).
    if (isPubKeyCompressed == true) pk.pop()
    pk.unshift(0)
    privateKeyDecimal = BigInteger(pk).toString()
    privateKeyHex = Crypto.util.bytesToHex(pk)
    return {
      privateKeyDecimal: privateKeyDecimal,
      privateKeyHex: privateKeyHex
    }
  },
  genNewIDpair: function () {
    try {
      var key = new Bitcoin.ECKey(false);
      key.setCompressed(true);
      return {
        floID: key.getBitcoinAddress(),
        pubKey: key.getPubKeyHex(),
        privKey: key.getBitcoinWalletImportFormat()
      }
    } catch (e) {
      console.log(e);
    }
  },
  verifyPrivKey_floID: function (privateKeyHex, floID) {
    try {
      var key = new Bitcoin.ECKey(privateKeyHex);
      if (key.priv == null)
        return false;
      key.setCompressed(true);
      if (floID == key.getBitcoinAddress())
        return true;
      else
        return false;
    } catch (e) {
      console.log(e);
    }
  },
  verifyPrivKey_pubKey: function (privateKeyHex, pubKey) {
    try {
      var key = new Bitcoin.ECKey(privateKeyHex);
      if (key.priv == null)
        return false;
      key.setCompressed(true);
      if (pubKey == key.getPubKeyHex())
        return true;
      else
        return false;
    } catch (e) {
      console.log(e);
    }
  }
}
//Script for AJAX, and register functions
function ajax(method, uri) {
  var request = new XMLHttpRequest();
  var url = `${server}/${uri}`
  console.log(url)
  var result;
  request.open(method, url, false);
  request.onload = function () {
    if (request.readyState == 4 && request.status == 200)
      result = this.response;
    else {
      console.log('error');
      result = false;
    }
  };
  request.send();
  console.log(result);
  return result;
}

function registerID(sender, onionAddr, wif, pubkey, username) {

  var receiver = adminID;

  var trx = bitjs.transaction();
  var utxoAmt = 0.0;
  var x = sendAmt + fee;
  var response = ajax("GET", `api/addr/${sender}/utxo`);
  var utxos = JSON.parse(response);
  for (var x = utxos.length - 1; x >= 0; x--) {
    if (utxoAmt < sendAmt + fee) {
      trx.addinput(utxos[x].txid, utxos[x].vout, utxos[x].scriptPubKey);
      utxoAmt += utxos[x].amount;
    } else
      break;
  }
  console.log(utxoAmt + ":" + (sendAmt + fee));
  if (utxoAmt < sendAmt + fee) {
    alert("Insufficient balance!");
    return;
  }

  trx.addoutput(receiver, sendAmt);
  console.log(receiver + ":" + sendAmt);

  var change = utxoAmt - sendAmt - fee;
  if (change > 0)
    trx.addoutput(sender, change);
  console.log(sender + ":" + change);
  var key = new Bitcoin.ECKey(wif);
  var sendFloData = JSON.stringify({
    FLO_chat: {
      onionAddr: onionAddr,
      name: username,
      pubKey: pubkey
    }
  });;
  trx.addflodata(sendFloData);
  console.log(sendFloData);

  var signedTxHash = trx.sign(wif, 1);
  console.log(signedTxHash);
  return broadcastTx(signedTxHash);
}

function broadcastTx(signedTxHash) {
  var http = new XMLHttpRequest();
  var url = `${server}/api/tx/send`;
  if (signedTxHash.length < 1) {
    alert("Empty Signature");
    return false;
  }

  var params = `{"rawtx":"${signedTxHash}"}`;
  var result;
  http.open('POST', url, false);

  //Send the proper header information along with the request
  http.setRequestHeader('Content-type', 'application/json');

  http.onreadystatechange = () => { //Call a function when the state changes.
    if (http.readyState == 4 && http.status == 200) {
      console.log(http.response);
      var txid = JSON.parse(http.response).txid.result;
      alert("Transaction successful! txid : " + txid);
      result = true;

    } else {
      console.log(http.responseText);
      result = false;
    }
  }
  http.send(params);
  return result;
}

function resetForm(formID) {
  var formEl = document.getElementById(formID);
  formEl.reset()
  var labelSpans = formEl.querySelectorAll('span');
  for (var i = 0; i < labelSpans.length; i++)
    labelSpans[i].textContent = '';
}

function userDataStartUp() {
  console.log("StartUp");
  resetForm("replyForm");
  //Initiate Event Handling
  document.getElementById("msgInput").addEventListener("keydown", (event) => {
    if (event.keyCode === 13 && !event.shiftKey) {
      event.preventDefault();
      sendMsg();
    }
  });
  document.getElementById("searchContact").addEventListener("input", searchContact, true);
  document.getElementById("searchList").addEventListener("input", searchChecklist, true);
  document.getElementById('fileInput').onchange = function () {
    var fileName = this.value.split("\\").pop();
    this.nextSibling.textContent = fileName;
  };

  //Start Program
  getDatafromAPI().then(result => {
    console.log(result);
    getContactsfromIDB().then(result => {
      contacts = result;
      getSuperNodeListfromIDB().then(result => {
        console.log(result)
        superNodeList = result;
        kBucketObj.launchKBucket().then(result => {
          console.log(result)
          getuserID().then(result => {
            console.log(result);
            selfID = result;
            if (superNodeList.includes(selfID))
              modSuperNode = true;
            alert(`${selfID}\nWelcome ${contacts[selfID].name}`)
            getGroupsfromIDB().then(result => {
              groups = result;
              readMsgfromIDB().then(result => {
                console.log(result);
                initselfWebSocket();
                pingSuperNodeForAwayMessages();
                displayContacts();
                const createClock = setInterval(checkStatusInterval, 30000);
              }).catch(error => {
                console.log(error);
              });
            }).catch(error => {
              console.log(error.message);
            });
          }).catch(error => {
            console.log(error.message);
          });
        }).catch(error => {
          console.log(error.message);
        });
      }).catch(error => {
        console.log(error.message);
      });
    }).catch(error => {
      console.log(error.message);
    });
  }).catch(error => {
    console.log(error.message);
  });

}

function storeContact(data) {
  return new Promise((resolve, reject) => {
    var idb = indexedDB.open("FLO_Chat");
    idb.onerror = (event) => {
      console.log("Error in opening IndexedDB!");
    };
    idb.onsuccess = (event) => {
      var db = event.target.result;
      var obs = db.transaction('contacts', "readwrite").objectStore('contacts');
      objectRequest = obs.put(data);
      objectRequest.onerror = (event) => {
        reject(Error('Error occured: Unable to store data'));
      };

      objectRequest.onsuccess = (event) => {
        resolve('Data saved OK');
        db.close();
      };
    };
  });
}

function storeSuperNodeData(data) {
  return new Promise((resolve, reject) => {
    var idb = indexedDB.open("FLO_Chat");
    idb.onerror = (event) => {
      reject("Error in opening IndexedDB!");
    };
    idb.onsuccess = (event) => {
      var db = event.target.result;
      var obs = db.transaction('superNodes', "readwrite").objectStore('superNodes');
      if (data.addNodes)
        for (var i = 0; i < data.addNodes.length; i++)
          obs.add(true, data.addNodes[i])
      if (data.removeNodes)
        for (var i = 0; i < data.removeNodes.length; i++)
          obs.delete(data.removeNodes[i])
      db.close();
      resolve('Updated superNodes list in IDB');
    };
  });
}

function getDatafromAPI() {
  return new Promise((resolve, reject) => {
    var addr = adminID;
    var idb = indexedDB.open("FLO_Chat");
    idb.onerror = (event) => {
      console.log("Error in opening IndexedDB!");
    };
    idb.onupgradeneeded = (event) => {
      var db = event.target.result;
      var objectStore0 = db.createObjectStore("superNodes");
      var objectStore1 = db.createObjectStore("contacts", {
        keyPath: 'floID'
      });
      objectStore1.createIndex('onionAddr', 'onionAddr', {
        unique: false
      });
      objectStore1.createIndex('name', 'name', {
        unique: false
      });
      objectStore1.createIndex('pubKey', 'pubKey', {
        unique: false
      });
      var objectStore2 = db.createObjectStore("lastTx");
      var objectStore3 = db.createObjectStore("messages", {
        keyPath: 'time'
      });
      objectStore3.createIndex('msgData', 'msgData', {
        unique: false
      });
      objectStore3.createIndex('floID', 'floID', {
        unique: false
      });
      objectStore3.createIndex('groupID', 'groupID', {
        unique: false
      });
      objectStore3.createIndex('sender', 'sender', {
        unique: false
      });
      objectStore3.createIndex('type', 'type', {
        unique: false
      });
      var objectStore4 = db.createObjectStore("groups", {
        keyPath: 'groupID'
      });
      objectStore4.createIndex('groupInfo', 'groupInfo', {
        unique: false
      });
      var objectStore5 = db.createObjectStore("groupPrivKey");
    };
    idb.onsuccess = (event) => {
      var db = event.target.result;
      var lastTx = db.transaction('lastTx', "readwrite").objectStore('lastTx');
      console.log(addr);
      new Promise((res, rej) => {
        var lastTxReq = lastTx.get(addr);
        lastTxReq.onsuccess = (event) => {
          var lasttx = event.target.result;
          if (lasttx === undefined) {
            lasttx = 0;
          }
          res(lasttx);
        }
      }).then(lasttx => {
        var response = ajax("GET", `api/addrs/${addr}/txs`);
        var nRequired = JSON.parse(response).totalItems - lasttx;
        console.log(nRequired);
        while (true && nRequired) {
          var response = ajax("GET", `api/addrs/${addr}/txs?from=0&to=${nRequired}`);
          response = JSON.parse(response);
          if (nRequired + lasttx != response.totalItems) {
            nRequired = response.totalItems - lasttx;
            continue;
          }
          response.items.reverse().forEach(tx => {
            try {
              if (tx.vin[0].addr == addr) {
                var data = JSON.parse(tx.floData).FLO_chat_SuperNode;
                if (data !== undefined) {
                  storeSuperNodeData(data).then(response => {}).catch(error => {
                    console.log(error.message);
                  });
                }
              } else {
                var data = JSON.parse(tx.floData).FLO_chat;
                if (data !== undefined) {
                  if (floOpt.getFloIDfromPubkeyHex(data.pubKey) != tx.vin[0].addr)
                    throw ("PublicKey doesnot match with floID")
                  data = {
                    floID: tx.vin[0].addr,
                    onionAddr: data.onionAddr,
                    name: data.name,
                    pubKey: data.pubKey
                  };
                  storeContact(data).then(response => {}).catch(error => {
                    console.log(error.message);
                  });
                }
              }
            } catch (e) {
              console.log(e)
            }
          });

          var obs = db.transaction('lastTx', "readwrite").objectStore('lastTx');
          obs.put(response.totalItems, addr);
          break;
        }
        db.close();
        resolve('retrived data from API');
      });
    };
  });
}

function getuserID() {
  return new Promise((resolve, reject) => {
    privKey = prompt("Enter FLO Private Key : ")
    var key = new Bitcoin.ECKey(privKey);
    while (key.priv == null) {
      privKey = prompt("Invalid FLO Private Key! Retry : ")
      key = Bitcoin.ECKey(privKey);
    }
    key.setCompressed(true);
    var userID = key.getBitcoinAddress();
    if (contacts[userID] === undefined)
      var reg = confirm(`${userID} is not registers to FLO chat!\nRegister FLO ID to this onion?`);
    else if (contacts[userID].onionAddr == window.location.host)
      resolve(userID)
    else
      var reg = confirm(`${userID} is registered to another onion!\nChange to this onion?`);

    if (reg) {
      var name = prompt("Enter your name :");
      var pubKey = key.getPubKeyHex();
      if (registerID(userID, window.location.host, privKey, pubKey, name)) {
        contacts[userID] = {
          onionAddr: window.location.host,
          name: name,
          pubKey: pubKey
        };
        resolve(userID);
      }
    }
    reject(`Unable to bind ${userID} to this onionAddress!\nTry again later!`);
  });
}

function getContactsfromIDB() {
  return new Promise((resolve, reject) => {
    var idb = indexedDB.open("FLO_Chat");
    idb.onerror = (event) => {
      reject("Error in opening IndexedDB!");
    };
    idb.onsuccess = (event) => {
      var db = event.target.result;
      var obs = db.transaction("contacts", "readwrite").objectStore("contacts");
      var getReq = obs.getAll();
      getReq.onsuccess = (event) => {
        var result = {}
        event.target.result.forEach(c => {
          result[c.floID] = c;
          searchIndex.add(c.floID, c.name + ' @' + c.floID);
        });
        resolve(result);
      }
      getReq.onerror = (event) => {
        reject('Unable to read contacts!')
      }
      db.close();
    };
  });
}

function getGroupsfromIDB() {
  return new Promise((resolve, reject) => {
    var idb = indexedDB.open("FLO_Chat");
    idb.onerror = (event) => {
      reject("Error in opening IndexedDB!");
    };
    idb.onsuccess = (event) => {
      var db = event.target.result;
      var obs = db.transaction("groups", "readwrite").objectStore("groups");
      var getReq = obs.getAll();
      getReq.onsuccess = (event) => {
        var result = {}
        event.target.result.forEach(g => {
          var gInfo = JSON.parse(g.groupInfo);
          result[g.groupID] = gInfo;
          searchIndex.add(g.groupID, gInfo.name + ' #' + gInfo.floID);
        });
        resolve(result);
      }
      getReq.onerror = (event) => {
        reject('Unable to read groups!')
      }
      db.close();
    };
  });
}

function getSuperNodeListfromIDB() {
  return new Promise((resolve, reject) => {
    var idb = indexedDB.open("FLO_Chat");
    idb.onerror = (event) => {
      reject("Error in opening IndexedDB!");
    };
    idb.onsuccess = (event) => {
      var db = event.target.result;
      var obs = db.transaction("superNodes", "readwrite").objectStore("superNodes");
      var getReq = obs.getAllKeys();
      getReq.onsuccess = (event) => {
        resolve(event.target.result);
      }
      getReq.onerror = (event) => {
        reject('Unable to read superNode list!')
      }
      db.close();
    };
  });
}

function readMsgfromIDB() {
  return new Promise((resolve, reject) => {
    var disp = document.getElementById("conversation");
    for (floID in contacts) {
      var createLi = document.createElement('div');
      createLi.setAttribute("id", floID);
      createLi.setAttribute("class", "message-inner");
      createLi.style.display = 'none';
      disp.appendChild(createLi);
    }
    for (floID in groups) {
      var createLi = document.createElement('div');
      createLi.setAttribute("id", floID);
      createLi.setAttribute("class", "message-inner");
      createLi.style.display = 'none';
      disp.appendChild(createLi);
    }
    var idb = indexedDB.open("FLO_Chat");
    idb.onerror = (event) => {
      reject("Error in opening IndexedDB!");
    };
    idb.onsuccess = (event) => {
      var db = event.target.result;
      var obs = db.transaction("messages", "readwrite").objectStore("messages");
      obs.openCursor().onsuccess = (event) => {
        var cursor = event.target.result;
        if (cursor) {
          createMsgElement(cursor.value);
          cursor.continue();
        } else {
          resolve("Read Msg from IDB");
        }
      };
      db.close();
    };
  });
}

function storeMsg(data) {
  var idb = indexedDB.open("FLO_Chat");
  idb.onerror = (event) => {
    console.log("Error in opening IndexedDB!");
  };
  idb.onsuccess = (event) => {
    var db = event.target.result;
    var obs = db.transaction("messages", "readwrite").objectStore("messages");
    obs.add(data);
    db.close();
  };
}

function storeSuperNodeMsg(data) {
  var idb = indexedDB.open("FLO_Chat", 2);
  idb.onerror = (event) => {
    console.log("Error in opening IndexedDB!");
  };
  idb.onupgradeneeded = (event) => {
    var objectStore = event.target.result.createObjectStore("superNodeMsg", {
      keyPath: 'id'
    });
    objectStore.createIndex('from', 'from', {
      unique: false
    });
    objectStore.createIndex('to', 'to', {
      unique: false
    });
    objectStore.createIndex('data', 'data', {
      unique: false
    });
  };
  idb.onsuccess = (event) => {
    var db = event.target.result;
    var obs = db.transaction("superNodeMsg", "readwrite").objectStore("superNodeMsg");
    var parsedData = JSON.parse(data);
    var id = '' + parsedData.from + '_' + parsedData.to + '_' + parsedData.time;
    obs.add({
      id: id,
      from: parsedData.from,
      to: parsedData.to,
      data: data
    });
    db.close();
  };
}

function displayContacts() {
  console.log('displayContacts');
  var listElement = document.getElementById('contact-display');
  for (floID in contacts) {
    var createLi = document.createElement('div');
    createLi.setAttribute("name", floID);
    createLi.setAttribute("onClick", 'changeReceiver(this)');
    createLi.setAttribute("class", "row sideBar-body");
    createLi.innerHTML = `<div class="col-sm-11 col-xs-11 sideBar-main">
                <div class="row">
                  <div class="col-sm-12 col-xs-12 sideBar-name">
                    <span class="name-meta"></span><br/>
                    <span class="time-meta">@${floID}</span>
                  </div>
                </div>
              </div>`;
    createLi.querySelector("span.name-meta").textContent = contacts[floID].name;
    listElement.appendChild(createLi);
  }
  for (floID in groups) {
    var createLi = document.createElement('div');
    createLi.setAttribute("name", floID);
    createLi.setAttribute("onClick", 'changeReceiver(this)');
    createLi.setAttribute("class", "row sideBar-body");
    createLi.innerHTML = `<div class="col-sm-11 col-xs-11 sideBar-main">
                <div class="row">
                  <div class="col-sm-12 col-xs-12 sideBar-name">
                    <span class="name-meta"></span><br/>
                    <span class="time-meta">#${floID}</span>
                  </div>
                </div>
              </div>`
    createLi.querySelector("span.name-meta").textContent = groups[floID].name;
    listElement.appendChild(createLi);
  }
}

function initselfWebSocket() {
  var selfwebsocket = new WebSocket("ws://" + location.host + "/ws");
  selfwebsocket.onopen = (evt) => {
    console.log("CONNECTED");
    var pass = prompt("Enter server password :")
    selfwebsocket.send("$" + pass);
  };
  selfwebsocket.onclose = (evt) => {
    console.log("DISCONNECTED");
  };
  selfwebsocket.onmessage = (evt) => {
    console.log(evt.data);
    try {
      var data = JSON.parse(evt.data);
      if (data.to == selfID) {
        console.log('Incoming data')
        processIncomingData(data);
      } else if (modSuperNode) {
        if (data.pingAway !== undefined)
          sendStoredSuperNodeMsgs(data.pingAway)
        else {
          kBucketObj.determineClosestSupernode(data.to).then(result => {
            console.log(result)
            if (result[0].floID == selfID)
              storeSuperNodeMsg(evt.data);
          }).catch(e => {
            console.log(e.message);
          });
        }
      }
    } catch (err) {
      if (evt.data[0] == '$')
        alert(evt.data);
      else
        console.log(err);
    }
  };
  selfwebsocket.onerror = (evt) => {
    console.log(evt);
  };
}

function processIncomingData(data) {
  if (data.directMsg !== undefined) {
    var msgData = floOpt.decryptData(data.directMsg.msgCipher, privKey)
    if (!floOpt.verifyData(msgData, data.directMsg.sign, contacts[data.from].pubKey))
      return
    var msgInfo = {
      time: Date.now(),
      floID: data.from,
      msgData: msgData,
      type: "R"
    }
    createMsgElement(msgInfo);
    storeMsg(msgInfo);
  } else if (data.groupMsg !== undefined && data.groupMsg.group in groups) {
    if (!(groups[data.groupMsg.group].members.includes(data.from)))
      return
    var msgData = floOpt.decryptData(data.groupMsg.msgCipher, groups[data.groupMsg.group].privKey);
    if (!floOpt.verifyData(msgData, data.groupMsg.sign, contacts[data.from].pubKey))
      return
    var msgInfo = {
      time: Date.now(),
      groupID: data.groupMsg.group,
      sender: data.from,
      msgData: msgData,
      type: "R"
    }
    createMsgElement(msgInfo);
    storeMsg(msgInfo)
  } else if (data.newGroup !== undefined) {
    var groupInfoStr = floOpt.decryptData(data.newGroup.groupInfo, privKey)
    var groupInfo = JSON.parse(groupInfoStr);
    if (floOpt.verifyData(groupInfoStr, data.newGroup.sign, contacts[data.from].pubKey) && floOpt.verifyPrivKey_pubKey(groupInfo.privKey, groupInfo.pubKey)) {
      groups[groupInfo.floID] = groupInfo;
      searchIndex.add(groupInfo.floID, groupInfo.name + ' #' + groupInfo.floID);
      storeGroup(groupInfoStr, groupInfo.floID);
      createGroupDisplay(groupInfo);
    }
  } else if (data.deleteGroup !== undefined && data.deleteGroup.group in groups) {
    if (data.from != groups[data.deleteGroup.group].creator && !groups[data.deleteGroup.group].admins.includes(data.from))
      return
    if (floOpt.verifyData('deleteGroup:' + data.deleteGroup.group, data.deleteGroup.sign, contacts[data.from].pubKey))
      deleteGroupFromLocal(data.deleteGroup.group);
  } else if (data.addGroupMembers !== undefined && data.addGroupMembers.group in groups) {
    if (data.from != groups[data.addGroupMembers.group].creator && !groups[data.addGroupMembers.group].admins.includes(data.from))
      return
    if (floOpt.verifyData('addGroupMembers:' + data.addGroupMembers.group + data.addGroupMembers.members.join('|'), data.addGroupMembers.sign, contacts[data.from].pubKey)) {
      groups[data.addGroupMembers.group].members = groups[data.addGroupMembers.group].members.concat(data.addGroupMembers.members);
      var groupInfoStr = JSON.stringify(groups[data.addGroupMembers.group]);
      storeGroup(groupInfoStr, data.addGroupMembers.group);
    }
  } else if (data.rmGroupMembers !== undefined && data.rmGroupMembers.group in groups) {
    if (data.from != groups[data.rmGroupMembers.group].creator && !groups[data.rmGroupMembers.group].admins.includes(data.from))
      return;
    if (data.rmGroupMembers.members.includes(groups[data.rmGroupMembers.group].creator) || data.rmGroupMembers.members.includes(data.from) || data.rmGroupMembers.members.includes(selfID))
      return;
    var newPrivKey = floOpt.decryptData(data.rmGroupMembers.newPrivKey, privKey);
    if (floOpt.verifyData('rmGroupMembers:' + data.rmGroupMembers.group + newPrivKey + data.rmGroupMembers.members.join('|'), data.rmGroupMembers.sign, contacts[data.from].pubKey)) {
      groups[data.rmGroupMembers.group].members = groups[data.rmGroupMembers.group].members.filter(x => !data.rmGroupMembers.members.includes(x)); //remove member from group
      groups[data.rmGroupMembers.group].admins = groups[data.rmGroupMembers.group].admins.filter(x => !data.rmGroupMembers.members.includes(x));
      groups[data.rmGroupMembers.group].privKey = newPrivKey;
      groups[data.rmGroupMembers.group].pubKey = floOpt.getPubKeyHex(newPrivKey);
      var groupInfoStr = JSON.stringify(groups[data.rmGroupMembers.group]);
      storeGroup(groupInfoStr, data.rmGroupMembers.group);
    }
  } else if (data.addGroupAdmins !== undefined && data.addGroupAdmins.group in groups) {
    if (data.from != groups[data.addGroupAdmins.group].creator)
      return
    if (floOpt.verifyData('addGroupAdmins:' + data.addGroupAdmins.group + data.addGroupAdmins.admins.join('|'), data.addGroupAdmins.sign, contacts[data.from].pubKey)) {
      groups[data.addGroupAdmins.group].admins = groups[data.addGroupAdmins.group].admins.concat(data.addGroupAdmins.admins);
      var groupInfoStr = JSON.stringify(groups[data.addGroupAdmins.group]);
      storeGroup(groupInfoStr, data.addGroupAdmins.group);
    }
  } else if (data.rmGroupAdmins !== undefined && data.rmGroupAdmins.group in groups) {
    if (data.from != groups[data.rmGroupAdmins.group].creator)
      return
    if (floOpt.verifyData('rmGroupAdmins:' + data.rmGroupAdmins.group + data.rmGroupAdmins.admins.join('|'), data.rmGroupAdmins.sign, contacts[data.from].pubKey)) {
      groups[data.rmGroupAdmins.group].admins = groups[data.rmGroupAdmins.group].admins.filter(x => !data.rmGroupAdmins.admins.includes(x)); //remove member from group
      var groupInfoStr = JSON.stringify(groups[data.rmGroupAdmins.group]);
      storeGroup(groupInfoStr, data.rmGroupAdmins.group);
    }
  } else if (data.leaveGroup !== undefined && data.leaveGroup.group in groups) {
    if (floOpt.verifyData('leaveGroup:' + data.leaveGroup.group, data.leaveGroup.sign, contacts[data.from].pubKey)) {
      groups[data.leaveGroup.group].members = groups[data.leaveGroup.group].members.filter(x => x != data.from); //remove member from group
      groups[data.leaveGroup.group].admins = groups[data.leaveGroup.group].admins.filter(x => x != data.from);
      var groupInfoStr = JSON.stringify(groups[data.leaveGroup.group]);
      storeGroup(groupInfoStr, data.leaveGroup.group);
      if (groups[data.leaveGroup.group].creator == selfID || groups[data.leaveGroup.group].admins.includes(selfID))
        revokeGroupKeys(data.leaveGroup.group);
    }
  } else if (data.revokeGroupKeys !== undefined && data.revokeGroupKeys.group in groups) {
    if (data.from != groups[data.revokeGroupKeys.group].creator && !groups[data.revokeGroupKeys.group].admins.includes(data.from))
      return;
    var newPrivKey = floOpt.decryptData(data.revokeGroupKeys.newPrivKey, privKey);
    if (floOpt.verifyData('revokeGroupKeys:' + data.revokeGroupKeys.group + newPrivKey, data.revokeGroupKeys.sign, contacts[data.from].pubKey)) {
      console.log("revoking old : ",groups[data.revokeGroupKeys.group].privKey)
      groups[data.revokeGroupKeys.group].privKey = newPrivKey;
      groups[data.revokeGroupKeys.group].pubKey = floOpt.getPubKeyHex(newPrivKey);
      var groupInfoStr = JSON.stringify(groups[data.revokeGroupKeys.group]);
      storeGroup(groupInfoStr, data.revokeGroupKeys.group);
      console.log("revoked new : ",groups[data.revokeGroupKeys.group].privKey)
    }
  }
}

function createMsgElement(msgInfo) {
  try {
    const type = {
      S: 'sender',
      R: 'receiver'
    };
    if (!msgInfo.groupID) {
      var msgCon = document.getElementById(msgInfo.floID);
      var msghd = '';
    } else {
      var msgCon = document.getElementById(msgInfo.groupID);
      var msghd = `<b>${msgInfo.sender}</b>`;
    }
    if (!msgCon)
      return;
    var msgData = JSON.parse(msgInfo.msgData);
    var msgEl = document.createElement('div');
    msgEl.setAttribute("class", "row message-body");
    msgEl.innerHTML = `<div class="col-sm-12 message-main-${type[msgInfo.type]}">
                    <div class="${type[msgInfo.type]}">
                      <span class="message-text">${msghd}
                        <i class="hidden" aria-hidden="true"></i>
                        <pre></pre>
                      </span>
                      <span class="message-time pull-right">
                        ${getTime(msgInfo.time)}
                      </span>
                    </div>
                  </div>`;
    msgEl.querySelector("pre").textContent = msgData.text;
    if (msgData.file) {
      var fileEl = msgEl.querySelector("i");
      fileEl.textContent = ` ${msgData.file.name} (${getFileSize(msgData.file.size)})`;
      fileEl.setAttribute("onclick", `downloadFile(${msgInfo.time})`);
      fileEl.setAttribute("class", "fa fa-arrow-circle-down");
    }
    msgCon.appendChild(msgEl);
  } catch (e) {
    console.log(e);
  }
}

function pingSuperNodeForAwayMessages() {
  kBucketObj.determineClosestSupernode(selfID).then(result => {
    var selfSuperNodeWS = new WebSocket("ws://" + contacts[result[0].floID].onionAddr + "/ws");
    selfSuperNodeWS.onopen = (evt) => {
      var data = JSON.stringify({
        pingAway: selfID
      });
      selfSuperNodeWS.send(data)
      console.log('Pinged selfSupernode for new messages')
    };
    selfSuperNodeWS.onerror = (ev) => {
      console.log('Unable to ping superNode for new messages');
    };
    selfSuperNodeWS.onclose = (ev) => {
      console.log('Connection with selfSupernode is closed')
    };
  }).catch(err => {
    console.log(err.message);
  });
}

function checkStatusInterval() {
  try {
    if (receiverWebSocket !== undefined && receiverWebSocket.readyState !== WebSocket.OPEN) {
      receiverWebSocket.close()
      receiverWebSocket = new WebSocket("ws://" + contacts[receiverID].onionAddr + "/ws");
      receiverWebSocket.onopen = (evt) => {
        receiverWebSocket.send('#')
      };
      receiverWebSocket.onerror = (ev) => {
        receiverStatus(false);
      };
      receiverWebSocket.onclose = (ev) => {
        receiverStatus(false);
      };
      receiverWebSocket.onmessage = (evt) => {
        console.log(evt.data);
        if (evt.data[0] == '#') {
          if (evt.data[1] == '+')
            receiverStatus(true);
          else if (evt.data[1] == '-')
            receiverStatus(false);
        }
      }
    }
  } catch (e) {
    console.log(e);
  }
}

function changeReceiver(param) {
  if (receiverID !== undefined)
    document.getElementById(receiverID).style.display = 'none';
  receiverID = param.getAttribute("name");
  document.getElementById('recipient-floID').textContent = receiverID;
  receiverStatus(false)
  document.getElementById(receiverID).style.display = 'block';

  if (receiverID in contacts) {
    msgType = 'direct';
    document.getElementById("groupOptions").style.display = 'none';
    try {
      if (receiverWebSocket !== undefined && receiverWebSocket.readyState === WebSocket.OPEN)
        receiverWebSocket.close()
      receiverWebSocket = new WebSocket("ws://" + contacts[receiverID].onionAddr + "/ws");
      receiverWebSocket.onopen = (ev) => {
        receiverWebSocket.send('#');
      };
      receiverWebSocket.onerror = (ev) => {
        receiverStatus(false);
      };
      receiverWebSocket.onclose = (ev) => {
        receiverStatus(false);
      };
      receiverWebSocket.onmessage = (evt) => {
        console.log(evt.data);
        if (evt.data[0] == '#') {
          if (evt.data[1] == '+')
            receiverStatus(true);
          else if (evt.data[1] == '-')
            receiverStatus(false);
        }
      }
    } catch (e) {
      console.log(e);
    }
  } else if (receiverID in groups) {
    msgType = 'group';
    if (receiverWebSocket !== undefined && receiverWebSocket.readyState === WebSocket.OPEN)
      receiverWebSocket.close()
    receiverWebSocket = undefined;
    var grpOpt = document.getElementById("groupOptions");
    grpOpt.style.display = "block";
    if (selfID == groups[receiverID].creator)
      grpOpt.setAttribute("class", "grp_creator");
    else if (groups[receiverID].admins.includes(selfID))
      grpOpt.setAttribute("class", "grp_admin");
    else
      grpOpt.setAttribute("class", "grp_member");
  }
}

function receiverStatus(status) {
  if (status)
    document.getElementById('recipient-status').style.color = "#4CC94C";
  else
    document.getElementById('recipient-status').style.color = "#CD5C5C";
  recStat = status;
}

function getTime(time) {
  var t = new Date(time);
  var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  var fn = (n) => {
    if (n < 10)
      return '0' + n;
    else
      return n;
  };
  var tmp = `${months[t.getMonth()]} ${fn(t.getDate())} ${t.getFullYear()} ${fn(t.getHours())}:${fn(t.getMinutes())}`;
  return tmp;
}

function getFileSize(size) {
  var filesizeUnits = ['B', 'kB', 'MB', 'GB', 'TB'];
  for (var i = 0; i < filesizeUnits.length; i++) {
    if (size / 1024 < 1)
      return `${Number((size).toFixed(1))}${filesizeUnits[i]}`;
    else
      size = size / 1024;
  }
}

function sendMsg() {
  if (receiverID === undefined) {
    alert("Select a contact and send message");
    return;
  }
  getReplyInputs().then(msgData => {
    console.log(msgData);
    var time = Date.now();
    var sign = floOpt.signData(msgData, privKey);
    if (msgType === 'direct')
      sendDirectMsg(msgData, receiverID, time, sign);
    else if (msgType === 'group')
      sendGroupMsg(msgData, receiverID, time, sign);
  }).catch(error => {
    console.log(error);
  })
}

function getfileData(fileInput) {
  return new Promise((resolve, reject) => {
    try {
      var files = document.getElementById(fileInput).files;
      if (files.length == 0)
        resolve(null);
      else {
        var reader = new FileReader();
        reader.onload = (event) => {
          var fileBytes = Crypto.charenc.Binary.stringToBytes(event.target.result);
          resolve({
            name: files[0].name,
            size: files[0].size,
            content: Crypto.util.bytesToBase64(fileBytes)
          });
        };
        reader.onerror = (event) => {
          reject("File could not be read! Code " + event.target.error.code);
        };
        reader.readAsBinaryString(files[0]);
      }
    } catch (e) {
      reject(e);
    }
  });
}

function getReplyInputs() {
  return new Promise((resolve, reject) => {
    getfileData('fileInput').then(fileData => {
      var msgData = {
        text: document.getElementById('msgInput').value,
        file: fileData
      };
      resetForm('replyForm');
      resolve(JSON.stringify(msgData));
    }).catch(error => {
      reject(error);
    });
  });
}

function sendDirectMsg(msgData, floID, time, sign) {
  var data = JSON.stringify({
    from: selfID,
    to: floID,
    directMsg: {
      time: time,
      msgCipher: floOpt.encryptData(msgData, contacts[floID].pubKey),
      sign: sign
    }
  });
  if (recStat)
    receiverWebSocket.send(data);
  else
    sendDataToSuperNode(floID, data);

  var msgInfo = {
    time: time,
    floID: floID,
    msgData: msgData,
    type: "S"
  }
  createMsgElement(msgInfo);
  storeMsg(msgInfo);
}

function sendGroupMsg(msgData, groupID, time, sign) {
  var data = {
    from: selfID,
    groupMsg: {
      group: groupID,
      time: time,
      msgCipher: floOpt.encryptData(msgData, groups[groupID].pubKey),
      sign: sign
    }
  };
  console.log(data);

  groups[groupID].members.forEach(floID => {
    if (floID == selfID) //dont send to self
      return;
    data.to = floID;
    sendData(floID, JSON.stringify(data));
  });
  var msgInfo = {
    time: time,
    sender: selfID,
    groupID: groupID,
    msgData: msgData,
    type: "S"
  }
  createMsgElement(msgInfo);
  storeMsg(msgInfo);
}

function sendStoredSuperNodeMsgs(floID) {
  var receiverWS = new WebSocket("ws://" + contacts[floID].onionAddr + "/ws");
  receiverWS.onopen = (ev) => {
    var idb = indexedDB.open("FLO_Chat", 2);
    idb.onerror = (event) => {
      console.log("Error in opening IndexedDB!");
    };
    idb.onupgradeneeded = (event) => {
      var objectStore = event.target.result.createObjectStore("superNodeMsg", {
        keyPath: 'id'
      });
      objectStore.createIndex('from', 'from', {
        unique: false
      });
      objectStore.createIndex('to', 'to', {
        unique: false
      });
      objectStore.createIndex('data', 'data', {
        unique: false
      });
    };
    idb.onsuccess = (event) => {
      var db = event.target.result;
      var obs = db.transaction("superNodeMsg", "readwrite").objectStore("superNodeMsg");
      obs.openCursor().onsuccess = (event) => {
        var cursor = event.target.result;
        if (cursor) {
          if (cursor.value.to == floID) {
            receiverWS.send(cursor.value.data);
            cursor.delete();
          }
          cursor.continue();
        } else {
          console.log('Sent All messages to ' + floID)
        }
      }
      db.close();
    };
  };
  receiverWS.onerror = (ev) => {
    console.log('Connection Error to ' + floID)
  };
  receiverWS.onclose = (ev) => {
    console.log('Disconnected from ' + floID)
  };
}

async function sendData(floID, data) {
  try {
    var recipientWS = new WebSocket("ws://" + contacts[floID].onionAddr + "/ws");
    recipientWS.onopen = (ev) => {
      recipientWS.send('#');
    };
    recipientWS.onerror = (ev) => {
      sendDataToSuperNode(floID, data);
    };
    recipientWS.onclose = (ev) => {
      console.log("Closed")
    };
    recipientWS.onmessage = (evt) => {
      console.log(evt.data);
      if (evt.data[0] == '#') {
        if (evt.data[1] == '+')
          recipientWS.send(data);
        else if (evt.data[1] == '-')
          sendDataToSuperNode(floID, data);
      }
    }
  } catch (e) {
    console.log(e);
  }
}

function sendDataToSuperNode(floID, data) {
  kBucketObj.determineClosestSupernode(floID).then(result => {
    var superNodeWS = new WebSocket("ws://" + contacts[result[0].floID].onionAddr + "/ws");
    superNodeWS.onopen = (ev) => {
      console.log(`Connected to ${floID}'s SuperNode!`);
      superNodeWS.send(data);
    };
    superNodeWS.onerror = (ev) => {
      console.log(`${floID}'s SuperNode is offline!`);
    };
    superNodeWS.onclose = (ev) => {
      console.log(`Disconnected from ${floID}'s SuperNode!`);
    };
  }).catch(e => {
    console.log(e.message);
  });
}

function createGroupDisplay(groupInfo) {
  var createLi = document.createElement('div');
  createLi.setAttribute("name", groupInfo.floID);
  createLi.setAttribute("onClick", 'changeReceiver(this)');
  createLi.setAttribute("class", "row sideBar-body");
  createLi.innerHTML = `<div class="col-sm-11 col-xs-11 sideBar-main">
              <div class="row">
                <div class="col-sm-12 col-xs-12 sideBar-name">
                  <span class="name-meta"></span><br/>
                  <span class="time-meta">#${groupInfo.floID}</span>
                </div>
              </div>
            </div>`;
  createLi.querySelector("span.name-meta").textContent = groupInfo.name;
  document.getElementById('contact-display').appendChild(createLi);

  var createEl = document.createElement('div');
  createEl.setAttribute("id", groupInfo.floID);
  createEl.setAttribute("class", "message-inner");
  createEl.style.display = 'none';
  document.getElementById("conversation").appendChild(createEl);
}

function storeGroup(groupInfoStr, groupID) {
  var idb = indexedDB.open("FLO_Chat");
  idb.onerror = (event) => {
    console.log("Error in opening IndexedDB!");
  };
  idb.onsuccess = (event) => {
    var db = event.target.result;
    console.log(groupID, groupInfoStr);
    var obs = db.transaction('groups', "readwrite").objectStore('groups');
    obs.put({
      groupID: groupID,
      groupInfo: groupInfoStr
    });
    db.close();
  };
}

function deleteGroupFromLocal(groupID) {
  delete groups[groupID];
  searchIndex.remove(groupID);
  var idb = indexedDB.open("FLO_Chat");
  idb.onerror = (event) => {
    console.log("Error in opening IndexedDB!");
  };
  idb.onsuccess = (event) => {
    var db = event.target.result;
    console.log('Delete Group:', groupID);
    var obs = db.transaction('groups', "readwrite").objectStore('groups');
    obs.delete(groupID);
    db.close();
  };
}

function storeGroupCreatorKey(groupID, encryptedPrivKey) {
  var idb = indexedDB.open("FLO_Chat");
  idb.onerror = (event) => {
    console.log("Error in opening IndexedDB!");
  };
  idb.onsuccess = (event) => {
    var db = event.target.result;
    var obs = db.transaction('groupPrivKey', "readwrite").objectStore('groupPrivKey');
    obs.put(JSON.stringify(encryptedPrivKey), groupID);
    db.close();
  };
}

function createGroup() {
  customCheckList(Object.keys(contacts), [selfID], 'Create Group', 'success').then(result => {
    var groupCreatorKey = floOpt.genNewIDpair();
    storeGroupCreatorKey(groupCreatorKey.floID, floOpt.encryptData(groupCreatorKey.privKey,contacts[selfID].pubKey))
    var grpInfo = floOpt.genNewIDpair();
    grpInfo.floID = groupCreatorKey.floID;
    grpInfo.name = result.grpName;
    grpInfo.members = result.members;
    grpInfo.members.push(selfID)
    grpInfo.creator = selfID;
    grpInfo.admins = [];
    var grpInfoStr = JSON.stringify(grpInfo);
    console.log(grpInfoStr);
    var data = {
      from: selfID,
      newGroup: {
        sign: floOpt.signData(grpInfoStr, privKey)
      }
    }
    grpInfo.members.forEach(floID => {
      data.to = floID;
      data.newGroup.groupInfo = floOpt.encryptData(grpInfoStr, contacts[floID].pubKey),
        sendData(floID, JSON.stringify(data));
    });
  }).catch(error => {
    console.log(error);
  })
}

function deleteGroup(groupID = receiverID) {
  var flag = confirm("Are you sure you want to delete this group?");
  if (flag) {
    var data = {
      from: selfID,
      deleteGroup: {
        group: groupID,
        sign: floOpt.signData('deleteGroup:' + groupID, privKey)
      }
    };
    groups[groupID].members.forEach(floID => {
      data.to = floID;
      sendData(floID, JSON.stringify(data));
    });
  }
}

function revokeGroupKeys(groupID = receiverID) {
  var newPrivKey = floOpt.genNewIDpair().privKey;
  var data = {
    from: selfID,
    revokeGroupKeys: {
      group: groupID,
      sign: floOpt.signData('revokeGroupKeys:' + groupID + newPrivKey, privKey)
    }
  }
  groups[groupID].members.forEach(floID => {
    data.to = floID;
    data.revokeGroupKeys.newPrivKey = floOpt.encryptData(newPrivKey, contacts[floID].pubKey)
    sendData(floID, JSON.stringify(data));
  });
}

function leaveGroup(groupID = receiverID) {
  var flag = confirm("Are you sure you want to leave this group?");
  if (flag) {
    var data = {
      from: selfID,
      leaveGroup: {
        group: groupID,
        sign: floOpt.signData('leaveGroup:' + groupID, privKey)
      }
    };
    groups[groupID].members.forEach(floID => {
      if (floID == selfID) //dont send to self
        return;
      data.to = floID;
      sendData(floID, JSON.stringify(data));
    });
    deleteGroupFromLocal(groupID);
  }
}

function addGroupMembers(groupID = receiverID) {
  customCheckList(Object.keys(contacts), groups[groupID].members, 'Add Members', 'success').then(result => {
    var newMembers = result.members;
    var data1 = {
      from: selfID,
      addGroupMembers: {
        group: groupID,
        members: newMembers,
        sign: floOpt.signData('addGroupMembers:' + groupID + newMembers.join('|'), privKey)
      }
    }
    groups[groupID].members.forEach(floID => {
      data1.to = floID;
      sendData(floID, JSON.stringify(data1));
    });
    var grpInfo = groups[groupID];
    grpInfo.members = grpInfo.members.concat(newMembers);
    var grpInfoStr = JSON.stringify(grpInfo);
    var data2 = {
      from: selfID,
      newGroup: {
        sign: floOpt.signData(grpInfoStr, privKey)
      }
    }
    newMembers.forEach(floID => {
      data2.to = floID;
      data2.newGroup.groupInfo = floOpt.encryptData(grpInfoStr, contacts[floID].pubKey),
        sendData(floID, JSON.stringify(data2));
    });
  }).catch(error => {
    console.log(error);
  })
}

function rmGroupMembers(groupID = receiverID) {
  customCheckList(groups[groupID].members, [groups[groupID].creator, selfID], 'Remove Members', 'danger').then(result => {
    var newPrivKey = floOpt.genNewIDpair().privKey;
    var data1 = {
      from: selfID,
      rmGroupMembers: {
        group: groupID,
        members: result.members,
        sign: floOpt.signData('rmGroupMembers:' + groupID + newPrivKey + result.members.join('|'), privKey)
      }
    }
    var data2 = {
      from: selfID,
      deleteGroup: {
        group: groupID,
        sign: floOpt.signData('deleteGroup:' + groupID, privKey)
      }
    };
    groups[groupID].members.forEach(floID => {
      if (result.members.includes(floID)) {
        data2.to = floID;
        sendData(floID, JSON.stringify(data2));
      } else {
        data1.to = floID;
        data1.rmGroupMembers.newPrivKey = floOpt.encryptData(newPrivKey, contacts[floID].pubKey)
        sendData(floID, JSON.stringify(data1));
      }
    });
  }).catch(error => {
    console.log(error);
  })
}

function addGroupAdmins(groupID = receiverID) {
  customCheckList(groups[groupID].members, groups[groupID].admins, 'Add Admins', 'success').then(result => {
    var newAdmins = result.members;
    var data = {
      from: selfID,
      addGroupAdmins: {
        group: groupID,
        admins: newAdmins,
        sign: floOpt.signData('addGroupAdmins:' + groupID + newAdmins.join('|'), privKey)
      }
    }
    groups[groupID].members.forEach(floID => {
      data.to = floID;
      sendData(floID, JSON.stringify(data));
    });
  }).catch(error => {
    console.log(error);
  })
}

function rmGroupAdmins(groupID = receiverID) {
  customCheckList(groups[groupID].admins, [], 'Remove Admins', 'danger').then(result => {
    var rmAdmins = result.members;
    var data = {
      from: selfID,
      rmGroupAdmins: {
        group: groupID,
        admins: rmAdmins,
        sign: floOpt.signData('rmGroupAdmins:' + groupID + rmAdmins.join('|'), privKey)
      }
    }
    groups[groupID].members.forEach(floID => {
      data.to = floID;
      sendData(floID, JSON.stringify(data));
    });
  }).catch(error => {
    console.log(error);
  })
}

function searchContact() {
  try {
    var searchKey = this.value;
    if (!searchKey)
      var searchResults = Object.keys(contacts).concat(Object.keys(groups));
    else
      var searchResults = searchIndex.search(searchKey);
    var contactList = document.getElementById('contact-display').children;
    for (var i = 0; i < contactList.length; i++) {
      if (searchResults.includes(contactList[i].getAttribute("name")))
        contactList[i].style.display = 'block';
      else
        contactList[i].style.display = 'none';
    };
  } catch (e) {
    console.log(e);
  }
}

function customCheckList(userList, ignoreList, okBtnVal = "Ok", okBtnType = "success") {
  var dialog = document.getElementById('overlay');
  dialog.style.display = "block";
  var okButton = dialog.querySelector('button.ok');
  var cancelButton = dialog.querySelector('button.cancel');
  okButton.setAttribute("class", `ok btn btn-${okBtnType}`);
  okButton.textContent = okBtnVal;
  var grpNameInput = dialog.querySelector('input.grpName')
  grpNameInput.style.display = (okBtnVal === "Create Group" ? "block" : "none");
  grpNameInput.value = '';
  var userChecklist = document.getElementById('userChecklist');
  userChecklist.innerHTML = '';
  for (var i = 0; i < userList.length; i++) {
    if (ignoreList.includes(userList[i]))
      continue;
    var listEl = document.createElement('label');
    listEl.setAttribute('class', "btn btn-default listLabel");
    listEl.setAttribute('name', userList[i]);
    listEl.innerHTML = `
          <span></span><br/>
          <sub>@${userList[i]}</sub>
          <input type="checkbox" class="badgebox" value="${userList[i]}">
          <span class="badge">&check;</span>`;
    listEl.querySelector("span").textContent = contacts[userList[i]].name;
    userChecklist.appendChild(listEl);
  }
  return new Promise((resolve, reject) => {
    dialog.addEventListener('click', function handleButtonClicks(e) {
      if (e.target.tagName !== 'BUTTON') {
        return;
      }
      dialog.removeEventListener('click', handleButtonClicks);
      dialog.style.display = 'none';
      if (e.target === okButton) {
        var selectedList = [];
        var checklist = dialog.querySelectorAll('input.badgebox');
        for (var i = 0; i < checklist.length; i++)
          if (checklist[i].checked)
            selectedList.push(checklist[i].value);
        if (selectedList.length == 0)
          reject('User Didnt select Any Users!');
        else
          resolve({
            grpName: grpNameInput.value,
            members: selectedList
          });
      } else if (e.target === cancelButton) {
        reject('User cancelled!');
      } else {
        reject('Some other button was clicked!');
      }
    });
  });
}

function searchChecklist() {
  try {
    var searchKey = this.value;
    if (!searchKey)
      var searchResults = Object.keys(contacts);
    else
      var searchResults = searchIndex.search(searchKey);
    var checklist = document.getElementById('userChecklist').children;
    for (var i = 0; i < checklist.length; i++) {
      if (searchResults.includes(checklist[i].getAttribute("name")))
        checklist[i].style.display = 'block';
      else
        checklist[i].style.display = 'none';
    };
  } catch (e) {
    console.log(e);
  }
}

function downloadFile(msgID) {
  var idb = indexedDB.open("FLO_Chat");
  idb.onerror = (event) => {
    console.log("Error in opening IndexedDB!");
  };
  idb.onsuccess = (event) => {
    var db = event.target.result;
    var msgReq = db.transaction('messages', "readwrite").objectStore('messages').get(msgID);
    msgReq.onsuccess = (event) => {
      var file = JSON.parse(event.target.result.msgData).file;
      var tmpEl = document.createElement('a');
      tmpEl.setAttribute('href', 'data:application/octet-stream;charset=utf-8;base64,' + file.content);
      tmpEl.setAttribute('download', file.name);
      tmpEl.style.display = 'none';
      document.body.appendChild(tmpEl);
      tmpEl.click();
      document.body.removeChild(tmpEl);
    }
  }
}