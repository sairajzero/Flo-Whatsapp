
window.indexedDB = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
window.IDBTransaction = window.IDBTransaction || window.webkitIDBTransaction || window.msIDBTransaction;
window.IDBKeyRange = window.IDBKeyRange || window.webkitIDBKeyRange || window.msIDBKeyRange;
   
if (!window.indexedDB) {
     window.alert("Your browser doesn't support a stable version of IndexedDB.")
}

var contacts = [];
var receiverID,senderID,recStat;
var selfwebsocket,receiverWebSocket;
var privKey;

var encrypt = {

            p: BigInteger("FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F", 16),

            exponent1: function () {
                return encrypt.p.add(BigInteger.ONE).divide(BigInteger("4"))
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
                    let receiverPublicKeyString = this.getUncompressedPublicKey(
                        receiverCompressedPublicKey);
                    var senderDerivedKey = {
                        XValue: "",
                        YValue: ""
                    };
                    senderDerivedKey = ellipticCurveEncryption.senderSharedKeyDerivation(
                        receiverPublicKeyString.x,
                        receiverPublicKeyString.y, senderPrivateKey);
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

            encryptMessage: function (data, receiverCompressedPublicKey) {
                var senderECKeyData = this.getSenderPublicKeyString();
                var senderDerivedKey = {
                    XValue: "",
                    YValue: ""
                };
                var senderPublicKeyString = {};
                senderDerivedKey = this.deriveSharedKeySender(
                    receiverCompressedPublicKey, senderECKeyData.privateKey);
                console.log("senderDerivedKey", senderDerivedKey);
                let senderKey = senderDerivedKey.XValue + senderDerivedKey.YValue;
                let secret = Crypto.AES.encrypt(data, senderKey);
                return {
                    secret: secret,
                    senderPublicKeyString: senderECKeyData.senderPublicKeyString
                };
            },

            decryptMessage: function (secret, senderPublicKeyString) {
                var receiverDerivedKey = {
                    XValue: "",
                    YValue: ""
                };
                var receiverECKeyData = {};
                var myPrivateKey = privKey;
                if (typeof myPrivateKey !== "string") throw new Error("No private key found.");

                let privateKey = this.wifToDecimal(myPrivateKey, true);
                if (typeof privateKey.privateKeyDecimal !== "string") throw new Error(
                    "Failed to detremine your private key.");
                receiverECKeyData.privateKey = privateKey.privateKeyDecimal;

                receiverDerivedKey = this.deriveReceiverSharedKey(senderPublicKeyString,
                    receiverECKeyData.privateKey);
                console.log("receiverDerivedKey", receiverDerivedKey);

                let receiverKey = receiverDerivedKey.XValue + receiverDerivedKey.YValue;
                let decryptMsg = Crypto.AES.decrypt(secret, receiverKey);
                return decryptMsg;
            },

        ecparams: EllipticCurve.getSECCurveByName("secp256k1"),
        getPubKeyHex: function(privateKeyHex){
          var key = new Bitcoin.ECKey(privateKeyHex);
          if(key.priv == null){
            alert("Invalid Private key");
            return;
          }
          key.setCompressed(true);
          var pubkeyHex = key.getPubKeyHex();
          return pubkeyHex;
        },
        getFLOIDfromPubkeyHex: function(pubkeyHex){
          var key =  new Bitcoin.ECKey().setPub(pubkeyHex);
          var floID = key.getBitcoinAddress();
          return floID;
        },
        sign: function (msg, privateKeyHex) {
            var key = new Bitcoin.ECKey(privateKeyHex);
            key.setCompressed(true);

            var privateKeyArr = key.getBitcoinPrivateKeyByteArray();
            privateKey = BigInteger.fromByteArrayUnsigned(privateKeyArr);
            var messageHash = Crypto.SHA256(msg);

            var messageHashBigInteger = new BigInteger(messageHash);
            var messageSign = Bitcoin.ECDSA.sign(messageHashBigInteger, key.priv);

            var sighex = Crypto.util.bytesToHex(messageSign);
            return sighex;
        },
        verify: function (msg, signatureHex, publicKeyHex) {
            var msgHash = Crypto.SHA256(msg);
            var messageHashBigInteger = new BigInteger(msgHash);

            var sigBytes = Crypto.util.hexToBytes(signatureHex);
            var signature = Bitcoin.ECDSA.parseSig(sigBytes);

            var publicKeyPoint = this.ecparams.getCurve().decodePointHex(publicKeyHex);

            var verify = Bitcoin.ECDSA.verifyRaw(messageHashBigInteger, signature.r, signature.s,
                publicKeyPoint);
            return verify;
        },
        wifToDecimal: function(pk_wif, isPubKeyCompressed = false) {
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
            }
      }

function convertStringToInt(string){
  return parseInt(string,10);
}

function userDataStartUp(){
    console.log("StartUp");

    document.getElementById("sendMsgInput").addEventListener("keyup",function(event){
      if(event.keyCode === 13){
        event.preventDefault();
        sendMsg();
      }
    });

    getDatafromAPI().then(function (result) {
      console.log(result);
      getDatafromIDB().then(function(result){
        contacts = arrayToObject(result);
        console.log(contacts);
        getuserID().then(function(result){
          console.log(result);
          senderID = result;
          alert(`${senderID}\nWelcome ${contacts[senderID].name}`)
          readMsgfromIDB().then(function(result){
            console.log(result);
            initselfWebSocket();
            displayContacts();
            const createClock = setInterval(checkStatusInterval, 30000);
          }).catch(function(error){
            console.log(error.message);
          });
          //startChats();
        }).catch(function (error) {
        console.log(error.message);
        });
      }).catch(function (error) {
        console.log(error.message);
      });
    }).catch(function (error) {
        console.log(error.message);
    });

}
    function arrayToObject(array){
      obj = {};
      array.forEach(element => {
        obj[element.floID] = {onionAddr : element.onionAddr, name : element.name, pubKey : element.pubKey};
      });
      return obj;
    }

    function storedata(data){
      return new Promise(
        function(resolve, reject) {
          var idb = indexedDB.open("FLO_Chat");
          idb.onerror = function(event) {
              console.log("Error in opening IndexedDB!");
          };
          idb.onsuccess = function(event) {
              var db = event.target.result;
              var obs = db.transaction('contacts', "readwrite").objectStore('contacts');
              objectRequest = obs.put(data);
              objectRequest.onerror = function(event) {
                  reject(Error('Error occured: Unable to store data'));
                };

              objectRequest.onsuccess = function(event) {
                  resolve('Data saved OK');
              db.close();
            };
           };
         }
       );
     }

      function getDatafromAPI(){
        return new Promise(
          function(resolve, reject) {
            var addr = "F6LUnwRRjFuEW97Y4av31eLqqVMK9FrgE2";
            var idb = indexedDB.open("FLO_Chat");
            idb.onerror = function(event) {
                console.log("Error in opening IndexedDB!");
            };
            idb.onupgradeneeded = function(event) {
                   var objectStore = event.target.result.createObjectStore("contacts",{ keyPath: 'floID' });
                   objectStore.createIndex('onionAddr', 'onionAddr', { unique: false });
                   objectStore.createIndex('name', 'name', { unique: false });
                   objectStore.createIndex('pubKey', 'pubKey', { unique: false });
                   var objectStore2 = event.target.result.createObjectStore("lastTx");
            };
            idb.onsuccess = function(event) {
               var db = event.target.result;
                //window["wait"] = addrList.length;
               var lastTx = db.transaction('lastTx', "readwrite").objectStore('lastTx');
               //addrList.forEach(function(addr){
                  console.log(addr);
                  new Promise(function(res,rej){
                    var lastTxReq = lastTx.get(addr);
                    lastTxReq.onsuccess = function(event){
                      var lasttx = event.target.result;
                      if(lasttx === undefined){
                          lasttx = 0;
                      }
                      res(lasttx);
                    }
                  }).then(function(lasttx){
                    var response = ajax("GET",`api/addrs/${addr}/txs`);
                      var nRequired = JSON.parse(response).totalItems - lasttx;
                      console.log(nRequired);
                      while(true && nRequired){
                        var response = ajax("GET",`api/addrs/${addr}/txs?from=0&to=${nRequired}`);
                        response = JSON.parse(response);
                        if (nRequired + lasttx != response.totalItems ){
                          nRequired = response.totalItems - lasttx;
                          continue;
                        }
                        response.items.reverse().forEach(function(tx){
                          try {
                            //if (tx.vin[0].addr != addr)
                              //return;
                            var data = JSON.parse(tx.floData).FLO_chat;
                            if(data !== undefined){
                              if(encrypt.getFLOIDfromPubkeyHex(data.pubKey)!=tx.vin[0].addr)
                                throw("PublicKey doesnot match with floID")
                              data = {floID : tx.vin[0].addr, onionAddr : data.onionAddr, name : data.name, pubKey:data.pubKey};
                              storedata(data).then(function (response) {
                              }).catch(function (error) {
                                  console.log(error.message);
                              });
                            }  
                          } catch (e) {
                            //console.log(e)
                          }
                        });

                        var obs = db.transaction('lastTx', "readwrite").objectStore('lastTx');
                        obs.put(response.totalItems,addr);
                          break;
                      }
                      window["wait"]--;
                      db.close();
                      resolve('retrived data from API');
                  });                    
                };
              }
            );
          }


function getuserID(){
  return new Promise(
    function(resolve,reject){
      privKey = prompt("Enter FLO Private Key : ")
      var key = new Bitcoin.ECKey(privKey);
      while(key.priv == null){
        privKey = prompt("Invalid FLO Private Key! Retry : ")
        key = Bitcoin.ECKey(privKey);
      }
      key.setCompressed(true);
      var userID = key.getBitcoinAddress();
      if (contacts[userID] ===  undefined)
        var reg = confirm(`${userID} is not registers to FLO chat!\nRegister FLO ID to this onion?`);
      else if (contacts[userID].onionAddr == window.location.host)
        resolve(userID)
      else
        var reg = confirm(`${userID} is registered to another onion!\nChange to this onion?`);
      
      if(reg){
        var name = prompt("Enter your name :");
        var pubKey = key.getPubKeyHex();
        if(registerID(userID,window.location.host,privKey,pubKey,name)){
          contacts[userID] = {onionAddr : window.location.host, name : name, pubKey : pubKey};
          resolve(userID);
        }       
      }
      reject(`Unable to bind ${userID} to this onionAddress!\nTry again later!`);
    }
  );
}

function getDatafromIDB(){
  return new Promise(
    function(resolve,reject){
      var idb = indexedDB.open("FLO_Chat");
      idb.onerror = function(event) {
         reject("Error in opening IndexedDB!");
      };
      idb.onsuccess = function(event) {
        var db = event.target.result;
        var obs = db.transaction("contacts", "readwrite").objectStore("contacts");
        var getReq = obs.getAll();
        getReq.onsuccess = function(event){
          resolve(event.target.result);
        }
        getReq.onerror = function(event){
          reject('Unable to read contacts!')
        }
        db.close();
      };
    }
  );
}

function readMsgfromIDB(){
  return new Promise(
    function(resolve,reject){
      var disp = document.getElementById("conversation");
      for(floID in contacts){
        var createLi = document.createElement('div');
        createLi.setAttribute("id", floID);
        createLi.setAttribute("class", "message-inner");
        createLi.style.display = 'none';
        disp.appendChild(createLi);
      }
      var idb = indexedDB.open("FLO_Chat",2);
      idb.onerror = function(event) {
        reject("Error in opening IndexedDB!");
      };
      idb.onupgradeneeded = function(event) {
        var objectStore = event.target.result.createObjectStore("messages",{ keyPath: 'time' });
        objectStore.createIndex('text', 'text', { unique: false });
        objectStore.createIndex('floID', 'floID', { unique: false });
        objectStore.createIndex('type', 'type', { unique: false });
      };
      idb.onsuccess = function(event) {
        var db = event.target.result;
        var obs = db.transaction("messages", "readwrite").objectStore("messages");
        obs.openCursor().onsuccess = function(event) {
          var cursor = event.target.result;
          if(cursor) {
            var chat = document.getElementById(cursor.value.floID);
            if(cursor.value.type == "R"){
              var msgdiv = document.createElement('div');
              msgdiv.setAttribute("class", "row message-body");
              msgdiv.innerHTML = `<div class="col-sm-12 message-main-receiver">
                      <div class="receiver">
                        <span class="message-text">
                         ${cursor.value.text}
                        </span>
                        <span class="message-time pull-right">
                          ${getTime(cursor.value.time)}
                        </span>
                      </div>
                    </div>`;
              chat.appendChild(msgdiv);
            }else if(cursor.value.type == "S"){
              var msgdiv = document.createElement('div');
              msgdiv.setAttribute("class", "row message-body");
              msgdiv.innerHTML = `<div class="col-sm-12 message-main-sender">
                      <div class="sender">
                        <span class="message-text">${cursor.value.text}
                        </span>
                        <span class="message-time pull-right">
                          ${getTime(cursor.value.time)}
                        </span>
                      </div>
                    </div>`;
              chat.appendChild(msgdiv);
            }

            cursor.continue();
          } else {
            console.log('Entries all displayed.');
            resolve("Read Msg from IDB");
          }
        };
        db.close();
      };
    }
  );
}

function storeMsg(data){
  var idb = indexedDB.open("FLO_Chat",2);
  idb.onerror = function(event) {
    console.log("Error in opening IndexedDB!");
  };
  idb.onupgradeneeded = function(event) {
    var objectStore = event.target.result.createObjectStore("messages",{ keyPath: 'time' });
    objectStore.createIndex('text', 'text', { unique: false });
    objectStore.createIndex('floID', 'floID', { unique: false });
    objectStore.createIndex('type', 'type', { unique: false });
  };
  idb.onsuccess = function(event) {
    var db = event.target.result;
    var obs = db.transaction("messages", "readwrite").objectStore("messages");
    obs.add(data);
    db.close();
  };
}

function displayContacts(){
  console.log('displayContacts');
  var listElement = document.getElementById('contact-display');
  for(floID in contacts){
    var createLi = document.createElement('div');
    createLi.setAttribute("name", floID);
    createLi.setAttribute("onClick", 'changeReceiver(this)');
    createLi.setAttribute("class", "row sideBar-body");
    createLi.innerHTML = `<div class="col-sm-11 col-xs-11 sideBar-main">
                <div class="row">
                  <div class="col-sm-8 col-xs-8 sideBar-name">
                    <span class="name-meta">${floID}
                  </span>
                  </div>
                  <div class="col-sm-4 col-xs-4 pull-right sideBar-time">
                    <span class="time-meta pull-right">${contacts[floID].name}
                  </span>
                  </div>
                </div>
              </div>`
    listElement.appendChild(createLi);
  }
}

function initselfWebSocket(){
  var selfwebsocket = new WebSocket("ws://"+location.host+"/ws");
  selfwebsocket.onopen = function(evt){ 
    console.log("CONNECTED");
    var pass = prompt("Enter server password :")
    selfwebsocket.send("$"+pass);
  };
  selfwebsocket.onclose = function(evt){ 
    console.log("DISCONNECTED");
  };
  selfwebsocket.onmessage = function(evt){ 
    console.log(evt.data); 
    try{
      var data = JSON.parse(evt.data);
      var msg = encrypt.decryptMessage(data.secret,data.pubVal)
      if(!encrypt.verify(msg,data.sign,contacts[data.from].pubKey))
        return
      var time = Date.now();
      var disp = document.getElementById(data.from);
      var msgdiv = document.createElement('div');
      msgdiv.setAttribute("class", "row message-body");
      msgdiv.innerHTML = `<div class="col-sm-12 message-main-receiver">
              <div class="receiver">
                <span class="message-text">
                 ${msg}
                </span>
                <span class="message-time pull-right">
                  ${getTime(time)}
                </span>
              </div>
            </div>`;
      disp.appendChild(msgdiv);
      storeMsg({time:time,floID:data.from,text:msg,type:"R"});
    }catch(err){
      if(evt.data[0]=='$')
        alert(evt.data);
      else
        console.log(err);
    }
  };
  selfwebsocket.onerror = function(evt){ 
    console.log(evt); 
  };
}

function checkStatusInterval(){
  try{
    if(receiverWebSocket !== undefined && receiverWebSocket.readyState !== WebSocket.OPEN){
      receiverWebSocket.close()
      receiverWebSocket = new WebSocket("ws://"+contacts[receiverID].onionAddr+"/ws");
      receiverWebSocket.onopen = function(evt){ receiverWebSocket.send('#') };
      receiverWebSocket.onerror = function(ev) { receiverStatus(false); };
      receiverWebSocket.onclose = function(ev) { receiverStatus(false); };
      receiverWebSocket.onmessage = function(evt){ 
      console.log(evt.data); 
      if(evt.data[0]=='#'){
        if (evt.data[1]=='+')
          receiverStatus(true);
        else if(evt.data[1]=='-')
          receiverStatus(false);
      }
    }
    }    
  }catch(e){
    console.log(e);
  }
}

function changeReceiver(param){
  if(receiverID !== undefined)
    document.getElementById(receiverID).style.display = 'none';
  console.log(param.getAttribute("name"));
  receiverID = param.getAttribute("name");
  document.getElementById('recipient-floID').innerHTML = receiverID;
  receiverStatus(false)
  document.getElementById(receiverID).style.display = 'block';
  try{
    if(receiverWebSocket !== undefined && receiverWebSocket.readyState === WebSocket.OPEN)
      receiverWebSocket.close()
    receiverWebSocket = new WebSocket("ws://"+contacts[receiverID].onionAddr+"/ws");
    receiverWebSocket.onopen = function(ev){ receiverWebSocket.send('#'); };
    receiverWebSocket.onerror = function(ev) { receiverStatus(false); };
    receiverWebSocket.onclose = function(ev) { receiverStatus(false); };
    receiverWebSocket.onmessage = function(evt){ 
      console.log(evt.data); 
      if(evt.data[0]=='#'){
        if (evt.data[1]=='+')
          receiverStatus(true);
        else if(evt.data[1]=='-')
          receiverStatus(false);
      }
    }
  }catch(e){
    console.log(e);
  }
}

function receiverStatus(status){
  if(status)
    document.getElementById('recipient-status').style.color = "#4CC94C";
  else
    document.getElementById('recipient-status').style.color = "#CD5C5C";
  recStat = status;
}

function getTime(time){
  var t = new Date(time);
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  var fn = function(n){
    if(n<10)
      return '0'+n;
    else
      return n;
  };
  var tmp = `${months[t.getMonth()]} ${fn(t.getDate())} ${t.getFullYear()} ${fn(t.getHours())}:${fn(t.getMinutes())}`;
  return tmp;
}

function sendMsg(){
  if(receiverID === undefined){
    alert("Select a contact and send message");
    return;
  }
  if(!recStat){
    alert("Recipient is offline! Try again later")
    return
  }
  var inp = document.getElementById('sendMsgInput')
  var msg = inp.value;
  inp.value = "";
  console.log(msg);
  var sign = encrypt.sign(msg,privKey)
  var msgEncrypt = encrypt.encryptMessage(msg,contacts[receiverID].pubKey)
  var data = JSON.stringify({from:senderID,secret:msgEncrypt.secret,sign:sign,pubVal:msgEncrypt.senderPublicKeyString});
  receiverWebSocket.send(data);
  console.log(`sentMsg : ${data}`);
      time = Date.now();
      var disp = document.getElementById(receiverID);
      var msgdiv = document.createElement('div');
      msgdiv.setAttribute("class", "row message-body");
      msgdiv.innerHTML = `<div class="col-sm-12 message-main-sender">
              <div class="sender">
                <span class="message-text">${msg}
                </span>
                <span class="message-time pull-right">
                  ${getTime(time)}
                </span>
              </div>
            </div>`;
      disp.appendChild(msgdiv);
      storeMsg({time:time,floID:receiverID,text:msg,type:"S"});
}