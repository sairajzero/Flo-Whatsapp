This is a unicast websocket chat.
To install :

    gcc websocket_chat.c mongoose.c -o websocket_chat
  
 To run the server :
 
    ./websocket_chat
 
 Instructions :
 
1. Open `127.0.0.1:8000` in your webBrowser
2. To bind floID send :
     `$<self_floID>`
3. To send msg to a floID :
    `<receiverfloID> <msg>`
