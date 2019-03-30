
window.indexedDB = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
window.IDBTransaction = window.IDBTransaction || window.webkitIDBTransaction || window.msIDBTransaction;
window.IDBKeyRange = window.IDBKeyRange || window.webkitIDBKeyRange || window.msIDBKeyRange;
   
if (!window.indexedDB) {
     window.alert("Your browser doesn't support a stable version of IndexedDB.")
}

contacts = []

function convertStringToInt(string){
  return parseInt(string,10);
}

function userDataStartUp(){
    console.log("StartUp");
    getDatafromAPI().then(function (res) {
      console.log(res);
    }).catch(function (error) {
        console.log(error.message);
    });

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
    function getDataFromIDB(){
    return new Promise(
    function(resolve, reject) {
        var idb = indexedDB.open("FLO_chat");
         idb.onerror = function(event) {
             console.log("Error in opening IndexedDB!");
         };
         idb.onsuccess = function(event) {
           var db = event.target.result;
           var obs = db.transaction('contacts', "readwrite").objectStore('contacts');
           appdetails = [];
           var cursorRequest = obs.openCursor();
           cursorRequest.onsuccess = function(event) {
             var cursor = event.target.result;
             if(cursor) {
               appdetails.push(cursor.value);
               cursor.continue();
             }else {
               resolve(appdetails);
             }
           };
           db.close();
         };
       }
     );
    }

    }
userDataStartUp();

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
                        console.log(window.location.host);
                        var obs2 = db.transaction('contacts', "readwrite").objectStore('contacts');
                        var getReq2 = obs2.get(userID);
                        getReq2.onsuccess = function(event){
                          var onionAddr = event.target.result;
                          if(onionAddr === window.location.host)
                            res(userID);
                          else if(onionAddr === undefined)
                            var reg = confirm('FLO ID is not registers to FLO chat!\nRegister FLO ID?');
                          else
                            var reg = confirm('FLO ID is registered to another onion!\nChange FLO ID to this onion?');
                          if(reg)
                            if(registerID(userID,window.location.host))
                              res(userID);
                          rej('Unable to register userID!\nTry again later!');
                        }
                  }
                }
              }).then(function(result){
                console.log(result);
                var obs = db.transaction('lastTx', "readwrite").objectStore('lastTx');
                obs.put(result,'userID');
                db.close();
              }).catch(function(error){
                console.log(error);
                db.close();
              });   
      };
    }
  );
}
getuserID();