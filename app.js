
window.indexedDB = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
window.IDBTransaction = window.IDBTransaction || window.webkitIDBTransaction || window.msIDBTransaction;
window.IDBKeyRange = window.IDBKeyRange || window.webkitIDBKeyRange || window.msIDBKeyRange;
   
if (!window.indexedDB) {
     window.alert("Your browser doesn't support a stable version of IndexedDB.")
}

var contacts = [];
var receiverID,senderID;
var selfwebsocket;

function convertStringToInt(string){
  return parseInt(string,10);
}

function userDataStartUp(){
    console.log("StartUp");
    getDatafromAPI().then(function (result) {
      console.log(result);
      getuserID().then(function(result){
        console.log(result);
        getDatafromIDB().then(function(result){
          contacts = arrayToObject(result);
          console.log(contacts);
          displayContacts();
          initselfWebSocket();
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
        obj[element.floID] = {onionAddr : element.onionAddr, name : element.name};
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
            var idb = indexedDB.open("FLO_Chat",1);
            idb.onerror = function(event) {
                console.log("Error in opening IndexedDB!");
            };
            idb.onupgradeneeded = function(event) {
                   var objectStore = event.target.result.createObjectStore("contacts",{ keyPath: 'floID' });
                   objectStore.createIndex('onionAddr', 'onionAddr', { unique: true });
                   objectStore.createIndex('name', 'name', { unique: false });
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
                              data = {floID : tx.vin[0].addr, onionAddr : data.onionAddr, name : data.name};
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
      var idb = indexedDB.open("FLO_Chat");
      idb.onerror = function(event) {
        console.log("Error in opening IndexedDB!");
      };
      idb.onsuccess = function(event) {
               var db = event.target.result;
               var obs = db.transaction('lastTx', "readwrite").objectStore('lastTx');
               new Promise(function(res,rej){
                 var getReq = obs.get('userID');
                 getReq.onsuccess = function(event){
                  var userID = event.target.result;
                  if(userID === undefined){
                      userID = prompt("Enter A Valid Flo ID!");
                      while(!validateAddr(userID)){
                          userID = prompt("Retry!Enter A Valid Flo ID!");
                        }
                        
                        var obs2 = db.transaction('contacts', "readwrite").objectStore('contacts');
                        var getReq2 = obs2.get(userID);
                        getReq2.onsuccess = function(event){
                          var data = event.target.result;
                          console.log(window.location.host);
                          //console.log(data.onionAddr);
                          if(data === undefined)
                            var reg = confirm('FLO ID is not registers to FLO chat!\nRegister FLO ID?');
                          else if(data.onionAddr == window.location.host)
                            res(userID);
                          else
                            var reg = confirm('FLO ID is registered to another onion!\nChange FLO ID to this onion?');
                          if(reg)
                            if(registerID(userID,window.location.host))
                              res(userID);
                          rej('Unable to register userID!\nTry again later!');
                        }
                  }
                  else
                    res(userID);
                }
              }).then(function(result){
                console.log(result);
                var obs = db.transaction('lastTx', "readwrite").objectStore('lastTx');
                senderID = result;
                obs.put(result,'userID');
                db.close();
                resolve('userID Initiated')
              }).catch(function(error){
                db.close();
                console.log(error.message);
                reject('userID Initiation Failed');
              });   
      };
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
    createLi.setAttribute("id", floID);
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
      var disp = document.getElementById("conversation");
      var data = JSON.parse(evt.data);
      var time = Date.now();
      var msgdiv = document.createElement('div');
      msgdiv.setAttribute("class", "row message-body");
      msgdiv.innerHTML = `<div class="col-sm-12 message-main-receiver">
              <div class="receiver">
                <span class="message-text">
                 <b>${data.from} : </b><br/>${data.msg}
                </span>
                <span class="message-time pull-right">
                  ${getTime(time)}
                </span>
              </div>
            </div>`;
      disp.appendChild(msgdiv);
      storeMsg({time:time,floID:data.from,text:data.msg,type:"R"});
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

function changeReceiver(param){
  console.log(param.id);
  receiverID = param.id;
  document.getElementById('recipient-floID').innerHTML = receiverID;
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
  var msg = document.getElementById('sendMsgInput').value;
  console.log(msg);
  var ws = new WebSocket("ws://"+contacts[receiverID].onionAddr+"/ws");
  ws.onopen = function(evt){
      var data = JSON.stringify({from:senderID,msg:msg});
      ws.send(data);
      console.log(`sentMsg : ${data}`);
      time = Date.now();
      var disp = document.getElementById("conversation");
      var msgdiv = document.createElement('div');
      msgdiv.setAttribute("class", "row message-body");
      msgdiv.innerHTML = `<div class="col-sm-12 message-main-sender">
              <div class="sender">
                <span class="message-text"><b>${receiverID} : </b><br/>${msg}
                </span>
                <span class="message-time pull-right">
                  ${getTime(time)}
                </span>
              </div>
            </div>`;
      disp.appendChild(msgdiv);
      storeMsg({time:time,floID:receiverID,text:msg,type:"S"});
      //send_check = 1;
      //recursion_called = 0;
      //addSentChat(msg.substring(2+msgArray[0].length+msgArray[1].length),timer,msgArray[0]);
      //addTick(message);
    }
  ws.onerror = function(ev) { console.log(ev); };
  ws.onclose = function(ev) { console.log(ev); };
}