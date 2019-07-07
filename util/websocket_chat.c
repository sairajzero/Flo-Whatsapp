/*
 * Copyright (c) 2014 Cesanta Software Limited
 * All rights reserved
 */

#include "mongoose.h"

static sig_atomic_t s_signal_received = 0;
static const char *s_http_port = "3579";
static struct mg_serve_http_opts s_http_server_opts;
static char serverpass[100];
static struct mg_connection *selfClient = NULL;

static void signal_handler(int sig_num) {
  signal(sig_num, signal_handler);  // Reinstantiate signal handler
  s_signal_received = sig_num;
}

static int is_websocket(const struct mg_connection *nc) {
  return nc->flags & MG_F_IS_WEBSOCKET;
}

static void broadcast(struct mg_connection *nc, const struct mg_str msg) {
  struct mg_connection *c;
  char buf[500];

  snprintf(buf, sizeof(buf), "%.*s", (int) msg.len, msg.p);
  printf("%s\n", buf); /* Local echo. */
  for (c = mg_next(nc->mgr, NULL); c != NULL; c = mg_next(nc->mgr, c)) {
    if (c == nc) continue; /* Don't send to the sender. */
    mg_send_websocket_frame(c, WEBSOCKET_OP_TEXT, buf, strlen(buf));
  }
}

static void unicast(struct mg_connection *nc,const struct mg_str msg) {
  char buf[5000];

  snprintf(buf, sizeof(buf), "%.*s", (int) msg.len, msg.p);
  printf("%s\n", buf); /* Local echo. */
  if(nc != NULL)
    mg_send_websocket_frame(nc, WEBSOCKET_OP_TEXT, buf, strlen(buf));
  else
    printf("No selfClient is connected!\n");
  
}

static void ev_handler(struct mg_connection *nc, int ev, void *ev_data) {
  switch (ev) {
    case MG_EV_WEBSOCKET_HANDSHAKE_DONE: {
      /* New websocket connection. Tell everybody. */
      //broadcast(nc, mg_mk_str("++ joined"));
      break;
    }
    case MG_EV_WEBSOCKET_FRAME: {
      struct websocket_message *wm = (struct websocket_message *) ev_data;
      /* New websocket message. Tell everybody. */
      struct mg_str d = {(char *) wm->data, wm->size};
      if (d.p[0] == '$'){
        char pass[100];
        snprintf(pass, sizeof(pass), "%.*s",(int)d.len-1, &d.p[1]);
        if(!strcmp(pass,serverpass)){
          if(selfClient!=NULL)
            unicast(selfClient,mg_mk_str("$Another login is encountered! Please close/refresh this window"));
          selfClient = nc;
          unicast(selfClient,mg_mk_str("$Access Granted!"));
          broadcast(nc, mg_mk_str("#+"));
        }else
          unicast(nc,mg_mk_str("$Access Denied!"));
      }
      else if(d.p[0] == '#'){
        if(selfClient == NULL)
          unicast(nc,mg_mk_str("#-"));
        else
          unicast(nc,mg_mk_str("#+"));
      }
      else
        unicast(selfClient,d);
      break;
    }
    case MG_EV_HTTP_REQUEST: {
      mg_serve_http(nc, (struct http_message *) ev_data, s_http_server_opts);
      break;
    }
    case MG_EV_CLOSE: {
      /* Disconnect. Tell everybody. */
      if (is_websocket(nc)) {
        if(nc == selfClient){
          selfClient = NULL;
          broadcast(nc, mg_mk_str("#-"));
        }  
      }
      break;
    }
  }
}

int main(int argc, char** argv) {

  if(argc<=1){
    printf("Enter server password : ");
    scanf("%s",serverpass);
  }
  else
    strcpy(serverpass,argv[1]);

  struct mg_mgr mgr;
  struct mg_connection *nc;

  signal(SIGTERM, signal_handler);
  signal(SIGINT, signal_handler);
  setvbuf(stdout, NULL, _IOLBF, 0);
  setvbuf(stderr, NULL, _IOLBF, 0);

  mg_mgr_init(&mgr, NULL);

  nc = mg_bind(&mgr, s_http_port, ev_handler);
  mg_set_protocol_http_websocket(nc);
  s_http_server_opts.document_root = ".";  // Serve current directory
  s_http_server_opts.enable_directory_listing = "yes";

  printf("Started on port %s\n", s_http_port);
  while (s_signal_received == 0) {
    mg_mgr_poll(&mgr, 200);
  }
  mg_mgr_free(&mgr);

  return 0;
}
