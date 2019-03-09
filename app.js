var displayAddress = "oKv51tWdZWJyMJfVCtQoTo2FxrPicPtWbe";
var floidToOnion = {};

window.indexedDB = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
   
window.IDBTransaction = window.IDBTransaction || window.webkitIDBTransaction || 
window.msIDBTransaction;
window.IDBKeyRange = window.IDBKeyRange || 
window.webkitIDBKeyRange || window.msIDBKeyRange
   
if (!window.indexedDB) {
     window.alert("Your browser doesn't support a stable version of IndexedDB.")
}

function convertStringToInt(string){
  return parseInt(string,10);
}

let ajax = function (uri, params, req_type, callback) {
            let url = `https://testnet.flocha.in/${uri}`;
      
      let response = {};
      var http = new XMLHttpRequest();
            http.open(req_type, url, true);

            http.onreadystatechange = function () { 
                if (http.readyState == 4 && http.status == 200) {
                    response.success = true;
                    response.data = http.responseText;
                    callback(response.data);
                } else {
                    response.success = false;
                }
            }

            http.send(params);
        }

function getTotalPages(address){
  var uri = "api/txs/?address="+address;
  try {
            let res = ajax(uri, null, 'GET', function (response) {
                try {
                      let data = JSON.parse(response);
                      getTransactionsByPage(address,convertStringToInt(data["pagesTotal"]+''));
                } catch (error) {
                        console.log(error);
                    }
                });
    } catch (error) {
                console.error(error);
        }
}

function getTransactionsByPage(address,totalPages){
  var cnt = 0;
  for(var i=0;i<totalPages;i++){
    var uri = "api/txs/?address="+address+"&pageNum="+i.toString();
    try {
              let res = ajax(uri, null, 'GET', function (response) {
                  try {
                        let data = JSON.parse(response);
                        getDataFromTransactions(data["txs"]);
                        cnt++;
                        if(cnt === totalPages)
                          checkIdStorageIndexdb();
                  } catch (error) {
                          console.log(error);
                      }
                  });
      } catch (error) {
                  console.error(error);
          }
  }
}

function getDataFromTransactions(txid){
  
  var len = txid.length;
  var senderAddr='';
  
  for(var i=0;i<len;i++){
    var transaction = txid[i];
    
    senderAddr = transaction["vin"]["0"]["addr"] + '';
    if(senderAddr !== displayAddress)
      continue;

    var transactionData = transaction["floData"];
    if(transactionData.startsWith('FloId:')){

      try{
        transactionData = JSON.parse(transactionData.split('FloId:')[1]);
        mapIdToOnion(transactionData);
      }catch(error){
        console.log(error);
        continue;
      }
    }
  }
}

function mapIdToOnion(transactionData){
  for(var key in transactionData)
    floidToOnion[key] = transactionData[key];
   // console.log(transactionData);
}

function checkIdStorageIndexdb(){
  //console.log("Hello");
  var request = window.indexedDB.open("floDbs", 3);
  var db,floId;
  request.onerror = function(event) {
      console.log("error: ",event.target);
  };         

  request.onsuccess = function(event) {
      db = request.result;
      console.log("success: "+ db);

      var objectStore = db.transaction(["floid"],"readwrite").objectStore("floid");
      
      objectStore.onerror = function(event) {
        console.log("No Store Found!");
     }

      objectStore.openCursor().onsuccess = function(event) {
        var cursor = event.target.result;
        
        if (cursor) {
           floId = cursor.value.id;
           cursor.continue();
        } else {
           console.log("No more entries!");
           if(floId === undefined){
            floId = prompt("Enter A Valid Flo ID!");
            while(floidToOnion[floId] === undefined)
              floId = prompt("Retry!Enter A Valid Flo ID!");
            storeFloIdIndexdb(floId+'');
        }
           else
            executeNow(floId);
        }
     };

     objectStore.openCursor().onerror = function(event) {
        console.log("No entries found!");
    };
      
  };

  request.onupgradeneeded = function(event) {
      console.log('upgrade');
      db = event.target.result;
      var objectStore = db.createObjectStore("floid", {keyPath:"id", autoIncrement:true});
  }

}

function storeFloIdIndexdb(floId){

  var db;
  var request = window.indexedDB.open("floDbs", 3);
  request.onerror = function(event) {
      console.log("error: ",event.target);
  };         

  request.onsuccess = function(event) {
      db = request.result;
      console.log("success: "+ db);
      request = db.transaction(["floid"], "readwrite")
                .objectStore("floid")
                .add({id:floId});
     
     request.onsuccess = function(event) {
        console.log("Floid has been added to your database.");
        executeNow(floId+'');
     };
     
     request.onerror = function(event) {
        console.log("Unable to add Floid in your database! ");
     }

  };

  request.onupgradeneeded = function(event) {
      db = event.target.result;
      var objectStore = db.createObjectStore("floid", {keyPath:"id", autoIncrement:true});
  }

}

getTotalPages(displayAddress);

function executeNow(floId){



  for(var key in floidToOnion){
    //console.log(floidToOnion[key]);
      if(key !== floId ){
      var listElement = document.getElementById('contact-list');
      var createLi = document.createElement('li');
      createLi.innerHTML = key;
      listElement.appendChild(createLi);
    }
  }

  var ulElement = document.getElementById('contact-list');
  var prevSelectedElement = '';
  var recipientId = '';
  var db,timing;
  var conversation = document.querySelector('.conversation-container');
  var isNetwork;
  var recursion_called,blueTickFlag = 0;
  //requestForDb();//Needed to be fixed

  if (navigator.onLine) {
    isNetwork = 1;
  } else {
    isNetwork = 0;
  }

  ulElement.onclick = function(event){
    event = event || window.event;
    var target = event.target || event.srcElement;
    console.log(target);
    if(target.getAttribute("class") === "button__badge")
      return;
    if(prevSelectedElement !== ''){
      prevSelectedElement.style.color = "#00ff00";
    }
    
    target.style.color = "red";
    var spanTag = target.getElementsByTagName('span')[0];
    if(spanTag !== undefined){
      spanTag.parentNode.removeChild(spanTag);
      //send to selected id from floid to add blue tick to chats of floid in selectedid user

    }
    recipientId = target.innerHTML;
    document.getElementsByClassName('user')[0].innerHTML = recipientId+'';
    //Determine Network Status Of Recipient
    makeOffline();
    addNetworkStatusOfRecipient(recipientId);
    //conversation.innerHTML = "";
    if(db === undefined)
      requestForDb();
    else
    {
      document.getElementsByClassName('input-msg')[0].setAttribute("placeholder","Type A Message!")
      document.getElementsByClassName('input-msg')[0].disabled = false;
      recursion_called = 0;
      readFromDb(recipientId);
    }
    prevSelectedElement = target;
    console.log(target.innerHTML);
  }

  function addNetworkStatusOfRecipient(recipientId){
    var checkSocket;
    if(recipientId == 'id2')
      checkSocket = new WebSocket("ws://"+floidToOnion[recipientId]+":8000/ws");
    else
      checkSocket = new WebSocket("ws://"+floidToOnion[recipientId]+"/ws");
    checkSocket.onopen = function(event){
      makeOnline();
    };
    checkSocket.onclose = function(event){
      makeOffline();
    };
    checkSocket.onerror = function(event){
      makeOffline();
      if(isNetwork === 0)
        document.getElementsByClassName('status')[0].innerHTML = "Unknown";
      console.log('error network');
      //if(isNetwork === 1)
        //addNetworkStatusOfRecipient(recipientId);
    };
  }
  
  function requestForDb(){
    var request = window.indexedDB.open("Database1", 3);
    request.onerror = function(event) {
        console.log("error: ",event.target);
    };         

    request.onsuccess = function(event) {
        db = request.result;
        console.log("success: "+ db);
          document.getElementsByClassName('input-msg')[0].setAttribute("placeholder","Type A Message!")
          document.getElementsByClassName('input-msg')[0].disabled = false;
          readFromDb(recipientId);
    };

    request.onupgradeneeded = function(event) {
      db = event.target.result;
      var objectStore = db.createObjectStore("chats", {keyPath:"id", autoIncrement:true});
    }
  }

 function requestForUnknownDb(msg,timing,senderId){
    var request = window.indexedDB.open("Database1", 3);
    request.onerror = function(event) {
        console.log("error: ",event.target);
    };         

    request.onsuccess = function(event) {
        db = request.result;
        console.log("success: "+ db);
        addReceivedChat(msg,timing,senderId);
    };

    request.onupgradeneeded = function(event) {
      db = event.target.result;
      var objectStore = db.createObjectStore("chats", {keyPath:"id", autoIncrement:true});
    }
  }


  function addUnsentChat(msg,time,selectedId){
    var request = db.transaction(["chats"], "readwrite")
     .objectStore("chats")
     .add({chat:"U"+selectedId+' '+msg,moment:time});
     
     request.onsuccess = function(event) {
        console.log("UnsentMessage has been added to your database.");
     };
     
     request.onerror = function(event) {
        console.log("Unable to add message in your database! ");
     }
  }

  function addSentChat(msg,time,selectedId){
    var request = db.transaction(["chats"], "readwrite")
     .objectStore("chats")
     .add({chat:"S"+selectedId+msg,moment:time});
     
     request.onsuccess = function(event) {
        console.log("Message has been added to your database.");
     };
     
     request.onerror = function(event) {
        console.log("Unable to add message in your database! ");
     }
  }

  function addReceivedChat(msg,time,selectedId){
    var request = db.transaction(["chats"], "readwrite")
     .objectStore("chats")
     .add({chat:"R"+selectedId+msg,moment:time});
     
     request.onsuccess = function(event) {
        console.log("Message has been added to your database.");
     };
     
     request.onerror = function(event) {
        console.log("Unable to add message in your database! ");
     }
  }

  function readFromDb(selectedId) {
    conversation.innerHTML = "";
    console.log("Bllllllllllllllllllllllllaaaaaaaaaaank");
    var objectStore = db.transaction(["chats"],"readwrite").objectStore("chats");
      
      objectStore.onerror = function(event) {
        console.log("No Store Found!");
     }
      objectStore.openCursor().onsuccess = function(event) {
        var cursor = event.target.result;
        
        if (cursor) {
          if(cursor.value.chat[0] === 'U'){
            console.log(cursor.value.chat);
            var len = cursor.value.chat.length;
            var timeSent = cursor.value.moment;
            var toSendId = '';
            for(var i=1;i<len;i++){
              if(cursor.value.chat[i] !== ' ')
                toSendId = toSendId + cursor.value.chat[i];
              else
                break;
            }
            console.log(recipientId+" checking "+toSendId);
            if(toSendId === recipientId){
              var idLen = toSendId.length;
              var msgToSend = cursor.value.chat.substring(idLen+2);
              var message = buildUnSentMessage(msgToSend,timeSent);
              //console.log("APPENDED",message);
              conversation.appendChild(message);
              conversation.scrollTop = conversation.scrollHeight;
              var req = cursor.delete();
              req.onsuccess = function() {
                console.log('Deleted');
                //time to resend
                //After deleting ,i also need to add to frontend,time icon to tick
                //Need to build a msg with no tick and add to conversation
                //console.log(msgToSend,timeSent);
                recursion_called = 0;
                sendMessage(toSendId+" "+floId+" "+msgToSend,timeSent,message);
              };
            }

          }
          else{
            var len = selectedId.length;
            var check = 0;
            for(var i=0;i<len;i++)
              if(cursor.value.chat[i+1] !== selectedId[i])
              {
                check = 1;
                break;
              }
            if(check === 0)
              addChatToFrontEnd(len,cursor.value.chat,cursor.value.moment);
          }
          cursor.continue();
        } else {
           console.log("No more entries!");
        }
     };

     objectStore.openCursor().onerror = function(event) {
        console.log("No entries found!");
     };
  }

  function addChatToFrontEnd(selectedIdLen,msg,time){

    var orig_msg = msg.substring(1+selectedIdLen);
    if(msg[0] == 'R')
      var message = buildMessageReceived(orig_msg,time);
    else if(msg[0] == 'S')
      var message = buildMessageSent(orig_msg,time);
    console.log("APPENDED",message);
    conversation.appendChild(message);
    //animateMessage(message);
    conversation.scrollTop = conversation.scrollHeight;
  }

  var deviceTime = document.querySelector('.status-bar .time');
  var messageTime = document.querySelectorAll('.message .time');

  deviceTime.innerHTML = moment().format('h:mm A');

  setInterval(function(){
    deviceTime.innerHTML = moment().format('h:mm A');
  }, 1000);

  setInterval(function(){
    console.log("Checking network status after 1 min");
    if(recipientId !== '' && isNetwork === 1)
      addNetworkStatusOfRecipient(recipientId);
    console.log(recursion_called);
    if(recursion_called === 6){
      recursion_called = 0;
      readFromDb(recipientId);
    }
  },80000);

  for (var i = 0; i < messageTime.length; i++){
    messageTime[i].innerHTML = moment().format('h:mm A');
  }

  var host = location.hostname  //location.hostname
  var wsUri = "ws://"+host+":8000/ws";
  console.log(wsUri);
  console.log(floidToOnion["id1"]);
  console.log(floidToOnion["id2"]);
  var websocket;
  var recipient_websocket;
  //var noOfUsersOnline = 0;
  init();

  function init(){
    //readFromDb();
      websocket = new WebSocket(wsUri);
      websocket.onopen = function(evt) { onOpen(evt) };
      websocket.onclose = function(evt) { onClose(evt) };
      websocket.onmessage = function(evt) { onMessage(evt) };
      websocket.onerror = function(evt) { onError(evt) };
  }

  function onOpen(evt){
      console.log("CONNECTED",floId);
      websocket.send(floId+'$');
      //makeOnline();
      //noOfUsersOnline++;
      //console.log("Total Users = "+noOfUsersOnline.toString());
      //document.getElementsByClassName('user')[0].innerHTML = host+'';
  }

  function onClose(evt){
      console.log("DISCONNECTED");
      //makeOffline();
      //noOfUsersOnline--;
      //console.log("Total Users = "+noOfUsersOnline.toString());
  }

  function onMessage(evt){
      console.log(evt.data);
      var msgArray = evt.data.split(' ');
      console.log("Message Received ",msgArray);
      if(msgArray[1] !== floId)
        return;
      var len = msgArray.length;
      var msg = "";
      for(var i=3;i<len-1;i++)
        msg = msg + msgArray[i] + ' ';
      msg = msg + msgArray[len-1];
      msg = msg.replace(/</g, "&lt;").replace(/>/g, "&gt;");
      //console.log(msg);
      var message = buildMessageReceived(msg,moment().format('h:mm A'));
    if(msgArray[2] === recipientId){
      conversation.appendChild(message);
      //add blue tick to the sender of received message
    }
    else{
      //implement badge unread message
      var contactListElement = document.getElementById('contact-list');
      //console.log(typeof contactListElement.innerHTML);
      var items = contactListElement.getElementsByTagName('li');
      var itemsLen = items.length;
      for(var i=0;i<itemsLen;i++){
        if(items[i].innerHTML.startsWith(msgArray[2])){
          var spanTag = items[i].getElementsByTagName('span')[0];
          if(spanTag === undefined){
            var createSpan = document.createElement('span');
            createSpan.setAttribute("class","button__badge");
            createSpan.innerHTML = "1";
            items[i].appendChild(createSpan);
            break;
          }
          else{
            var counter = parseInt(spanTag.innerHTML);
            counter++;
            spanTag.innerHTML = counter+'';
            break;
          }
        }
      }
    }
    if(db === undefined)
      requestForUnknownDb(msg,timing,msgArray[2]);
    else
      addReceivedChat(msg,timing,msgArray[2]);
    //animateMessage(message);
    conversation.scrollTop = conversation.scrollHeight;
  }

  function onError(evt){
      console.log(evt.data);
  }

  var form = document.querySelector('.conversation-compose');

  form.addEventListener('submit', newMessage);

  function newMessage(e) {
    var input = e.target.input;
    var temp_input = '';
    if(input.value){
      
      input.value = input.value.replace(/</g, "&lt;").replace(/>/g, "&gt;");
      //console.log(input.value);
      var message = buildUnSentMessage(input.value,moment().format('h:mm A'));  //Need to change span tag of build
      console.log(message);
      console.log("APPENDED",message);
      conversation.appendChild(message);
      //animateMessage(message);
      console.log("Network Status",isNetwork);
      temp_input = input.value;
      if(isNetwork === 0){
        console.log("Network Status Offline");
        addUnsentChat(temp_input,timing,recipientId);
        input.value = '';
        conversation.scrollTop = conversation.scrollHeight;
        e.preventDefault();
        return;
      }
      //websocket.send(input.value);
      /*recipient_websocket.onopen = function(event){
        recipient_websocket.send(recipientId+" "+floId+" "+temp_input);
        //recipient_websocket.close();
      }
      recipient_websocket.onerror = function(event){
        console.log("Message Not Sent To Recipient!Try Again!");
      }*/
      recursion_called = 0;
      sendMessage(recipientId+" "+floId+" "+temp_input,timing,message);
    }
    input.value = '';
    conversation.scrollTop = conversation.scrollHeight;

    e.preventDefault();
  }

  function sendMessage(msg,timer,message){
    // Wait until the state of the socket is not ready and send the message when it is...
    var msgArray = msg.split(' ');
    var ws,send_check = 0;
    console.log('check');
    if(msgArray[0] === "id2")
      ws = new WebSocket("ws://"+floidToOnion[msgArray[0]]+":8000/ws");
    else
      ws = new WebSocket("ws://"+floidToOnion[msgArray[0]]+"/ws");

    ws.onopen = function(evt){
      console.log('open');
      ws.send(msg);
      send_check = 1;
      recursion_called = 0;
      addSentChat(msg.substring(2+msgArray[0].length+msgArray[1].length),timer,msgArray[0]);
      addTick(message);
    }
    ws.onclose = function(evt){
      console.log("connection closed");
       if(network === 1 && send_check === 0 && recursion_called <= 5){
        recursion_called++;
        sendMessage(msg,timer,message);
        return;
      }
      addUnsentChat(msg.substring(2+msgArray[0].length+msgArray[1].length),timer,msgArray[0]);       
    }
    ws.onerror = function(evt){
      console.log('error');
      if(isNetwork === 1 && send_check === 0 && recursion_called <= 5){
        recursion_called++;
        sendMessage(msg,timer,message);
        return;
      }
      addUnsentChat(msg.substring(2+msgArray[0].length+msgArray[1].length),timer,msgArray[0]);
      //conversation.innerHTML = "";
      //readFromDb(msgArray[0]);
    } 
}

  function buildUnSentMessage(text,time) {
    var element = document.createElement('div');
    timing = time;
    element.classList.add('message', 'sent');

    element.innerHTML = text +
      '<span class="metadata">' +
        '<span class="time">' + time + '</span>' + '<span data-icon="msg-time" class="unsend_msg"><svg id="Layer_1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 15" width="16" height="15"><path fill="#859479" d="M9.75 7.713H8.244V5.359a.5.5 0 0 0-.5-.5H7.65a.5.5 0 0 0-.5.5v2.947a.5.5 0 0 0 .5.5h.094l.003-.001.003.002h2a.5.5 0 0 0 .5-.5v-.094a.5.5 0 0 0-.5-.5zm0-5.263h-3.5c-1.82 0-3.3 1.48-3.3 3.3v3.5c0 1.82 1.48 3.3 3.3 3.3h3.5c1.82 0 3.3-1.48 3.3-3.3v-3.5c0-1.82-1.48-3.3-3.3-3.3zm2 6.8a2 2 0 0 1-2 2h-3.5a2 2 0 0 1-2-2v-3.5a2 2 0 0 1 2-2h3.5a2 2 0 0 1 2 2v3.5z"></path></svg></span>';

    return element;
  }

  function buildMessageSent(text,time) {
    var element = document.createElement('div');
    timing = time;
    element.classList.add('message', 'sent');

    element.innerHTML = text +
      '<span class="metadata">' +
        '<span class="time">' + time + '</span>' +
        '<span class="tick tick-animation">' +
          '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="15" id="msg-dblcheck" x="2047" y="2061"><path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.88a.32.32 0 0 1-.484.032l-.358-.325a.32.32 0 0 0-.484.032l-.378.48a.418.418 0 0 0 .036.54l1.32 1.267a.32.32 0 0 0 .484-.034l6.272-8.048a.366.366 0 0 0-.064-.512zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.88a.32.32 0 0 1-.484.032L1.892 7.77a.366.366 0 0 0-.516.005l-.423.433a.364.364 0 0 0 .006.514l3.255 3.185a.32.32 0 0 0 .484-.033l6.272-8.048a.365.365 0 0 0-.063-.51z" fill="#92a58c"/></svg>' +
          '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="15" id="msg-dblcheck-ack" x="2063" y="2076"><path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.88a.32.32 0 0 1-.484.032l-.358-.325a.32.32 0 0 0-.484.032l-.378.48a.418.418 0 0 0 .036.54l1.32 1.267a.32.32 0 0 0 .484-.034l6.272-8.048a.366.366 0 0 0-.064-.512zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.88a.32.32 0 0 1-.484.032L1.892 7.77a.366.366 0 0 0-.516.005l-.423.433a.364.364 0 0 0 .006.514l3.255 3.185a.32.32 0 0 0 .484-.033l6.272-8.048a.365.365 0 0 0-.063-.51z" fill="#4fc3f7"/></svg>' +
        '</span>' +
      '</span>';

    return element;
  }

  function buildMessageReceived(text,time) {
    var element = document.createElement('div');
    timing = time;
    element.classList.add('message', 'received');

    element.innerHTML = text +
      '<span class="metadata">' +
        '<span class="time">' + time + '</span>' +
        '<span class="tick tick-animation">' +
          '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="15" id="msg-dblcheck" x="2047" y="2061"><path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.88a.32.32 0 0 1-.484.032l-.358-.325a.32.32 0 0 0-.484.032l-.378.48a.418.418 0 0 0 .036.54l1.32 1.267a.32.32 0 0 0 .484-.034l6.272-8.048a.366.366 0 0 0-.064-.512zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.88a.32.32 0 0 1-.484.032L1.892 7.77a.366.366 0 0 0-.516.005l-.423.433a.364.364 0 0 0 .006.514l3.255 3.185a.32.32 0 0 0 .484-.033l6.272-8.048a.365.365 0 0 0-.063-.51z" fill="#92a58c"/></svg>' +
          '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="15" id="msg-dblcheck-ack" x="2063" y="2076"><path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.88a.32.32 0 0 1-.484.032l-.358-.325a.32.32 0 0 0-.484.032l-.378.48a.418.418 0 0 0 .036.54l1.32 1.267a.32.32 0 0 0 .484-.034l6.272-8.048a.366.366 0 0 0-.064-.512zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.88a.32.32 0 0 1-.484.032L1.892 7.77a.366.366 0 0 0-.516.005l-.423.433a.364.364 0 0 0 .006.514l3.255 3.185a.32.32 0 0 0 .484-.033l6.272-8.048a.365.365 0 0 0-.063-.51z" fill="#4fc3f7"/></svg>' +
        '</span>' +
      '</span>';

    return element;
  }

  function blueTickMessage(message) {
    setTimeout(function() {
      var tick = message.querySelector('.tick');
      tick.classList.remove('tick-animation');
    }, 500);
  }

  function addTick(message) {
    setTimeout(function() {
      var timerElement = message.querySelector('.unsend_msg');
      timerElement.outerHTML =  '<span class="tick tick-animation">' +
          '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="15" id="msg-dblcheck" x="2047" y="2061"><path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.88a.32.32 0 0 1-.484.032l-.358-.325a.32.32 0 0 0-.484.032l-.378.48a.418.418 0 0 0 .036.54l1.32 1.267a.32.32 0 0 0 .484-.034l6.272-8.048a.366.366 0 0 0-.064-.512zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.88a.32.32 0 0 1-.484.032L1.892 7.77a.366.366 0 0 0-.516.005l-.423.433a.364.364 0 0 0 .006.514l3.255 3.185a.32.32 0 0 0 .484-.033l6.272-8.048a.365.365 0 0 0-.063-.51z" fill="#92a58c"/></svg>' +
          '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="15" id="msg-dblcheck-ack" x="2063" y="2076"><path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.88a.32.32 0 0 1-.484.032l-.358-.325a.32.32 0 0 0-.484.032l-.378.48a.418.418 0 0 0 .036.54l1.32 1.267a.32.32 0 0 0 .484-.034l6.272-8.048a.366.366 0 0 0-.064-.512zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.88a.32.32 0 0 1-.484.032L1.892 7.77a.366.366 0 0 0-.516.005l-.423.433a.364.364 0 0 0 .006.514l3.255 3.185a.32.32 0 0 0 .484-.033l6.272-8.048a.365.365 0 0 0-.063-.51z" fill="#4fc3f7"/></svg>' +
        '</span>' +
      '</span>';
      //tick.classList.remove('tick-animation');
    }, 500);
  }

  window.addEventListener('online', function(e) {
    console.log('And we\'re back :).');
    //conversation.innerHTML = "";
    if(recipientId !== '' && recipientId !== undefined){
      addNetworkStatusOfRecipient(recipientId);
      readFromDb(recipientId);
    }
    //makeOnline();
    isNetwork = 1;
    //alert('You Have Been Disconnected!');
    //window.location.href = floidToOnion[floId];
  }, false);

  window.addEventListener('offline', function(e) {
    console.log('Connection is down.');
    //makeOffline();
    if(recipientId !== '' && recipientId !== undefined)
      document.getElementsByClassName('status')[0].innerHTML = "Unknown";
    isNetwork = 0;
  }, false);

  function makeOnline(){
    console.log(document.getElementsByClassName('status')[0]);
      document.getElementsByClassName('status')[0].innerHTML = "Online";
  }

  function makeOffline(){
      document.getElementsByClassName('status')[0].innerHTML = "Offline";
  }

  //window.addEventListener("load", init, false);

}
