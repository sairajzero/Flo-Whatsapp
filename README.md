# Flo-Whatsapp: Introduction 
This is a peer-peer Whatsapp like chat application totally encrypted in transit without needing a central server. Current web based technologies have a inbound address problem namely ordinary web users do not have a fixed IP, so it is not easy to establish connection to them. We propose to solve that problem by using TOR addresses for ordinary users which can provide a fixed inbound routable address on Internet for everyone including for those on dynamic IPs. Ever since Brave Browser an almost perfect clone of Google Chrome introduced TOR based browsing, it has become very easy to connect to a TOR based service. We believe it can form a stable architecture for peer to peer services. Another limitation of current web based technologies is ordinary users cannot allocate a fixed port using just their web browsers for inbound connections. So every user will need to run his own webservers on which he can receive chat messages. We could not find a way to eliminate webservers. But we have found a very simple webserver called Mongoose Webserver, where a user can invoke a fixed port based service on click of a single button. To facilitate globally unique identification of every peer, we propose to use FLO Blockchain IDs. Then user can then attach his TOR address onto his FLO id inside the FLO Blockchain. Since the blockchain data is immutable, it will provide a continous uniterruptable source of connection information based on user's FLO ID.  

## Requirements
1. Brave Browser
2. Tor Service(sudo apt-get install tor)
3. Knowledge of hosting website on tor network(https://medium.com/@kaushalagarwal_73962/how-to-host-a-website-in-deep-web-onion-url-271cc97469e4)

## Steps to Run
1. First user should decide his flo-id and onion service url and send it to the admin who will store his information in the flocha blockchain  using https://github.com/kaushalag29/Flo-Bus-Project Flosend(test).html file.
Id --> Onion Url
Keep sender and receiver's address same.
Change the displayAddress variable in app.js file to receivers's address.

Syntax for making transaction:- 
For an instance

FloId:{"id3":"atj2ncecfitrvvje.onion:8000","id4":"atj2ncecfitrvvje.onion:8000","id5":"atj2ncecfitrvvje.onion:8000"}

Send in this format and Plz don't use "id2" for now....

2. Clone This Repo.
3. Download mongoose server https://github.com/cesanta/mongoose
Copy all files of html,css,js and websocket_chat.c in examples/websocket_chat folder in mongoose dir.
use "make" command to create binary file of websocket_chat.

### You can watch video demonstration also using this link https://youtu.be/60gcBO0bcVQ
4. Start Tor Service using sudo service tor start after setting up your onion service url.
5. Set your system socks5 proxy settings to 127.0.0.1:9050(The port on which tor service runs)  
6. Run Binary file of websocket_chat using command (./websocket_chat)
7. Open Brave Browser and open your respective onion service url:port(By default 8000)
8. Now the webapp will open a prompt for you to enter your valid floid.

That's All Next You can select respective floid to send messages.

## How the website works
Firstly it fetches data of floid-->onion service url from the flocha blockchain to display in the contact section.Secondly checks for validity of floid user when he enters his id.Then on selecting a contact it fetches chat data from indexdb database of browser being used.Javascript code in app.js handles what to do on receiving messages and how to send message to respective id.Double tick indicates that message has been delivered.  



