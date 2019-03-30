/*
 * Copyright (c) 2014 Cesanta Software Limited
 * All rights reserved
 */

#include "mongoose.h"

static sig_atomic_t s_signal_received = 0;
static const char *s_http_port = "8000";
static struct mg_serve_http_opts s_http_server_opts;

static void signal_handler(int sig_num) {
  signal(sig_num, signal_handler);  // Reinstantiate signal handler
  s_signal_received = sig_num;
}

static int is_websocket(const struct mg_connection *nc) {
  return nc->flags & MG_F_IS_WEBSOCKET;
}

struct pair{
    char floId[101];
    struct mg_connection *connPointer;
};

struct pair hashmap[1000];

static void broadcast(struct mg_connection *nc, const struct mg_str msg,char id[]) {

  char buf[500000];
  char addr[32];
  mg_sock_addr_to_str(&nc->sa, addr, sizeof(addr),
                      MG_SOCK_STRINGIFY_IP | MG_SOCK_STRINGIFY_PORT);

  snprintf(buf, sizeof(buf), "%s %.*s", addr, (int) msg.len, msg.p);
  printf("%s\n", buf); /* Local echo. */
  printf("sendTo %s\n",id);

    for(int i=0;i<1000;i++)
    {
        if(strlen(hashmap[i].floId)==0)
            continue;
        printf("%s %s\n",id,hashmap[i].floId);

        if(strcmp(hashmap[i].floId,id) == 0)
        {
            printf("Msg Sent\n");
            mg_send_websocket_frame(hashmap[i].connPointer, WEBSOCKET_OP_TEXT, buf, strlen(buf));
            break;
        }
    }

}

static void ev_handler(struct mg_connection *nc, int ev, void *ev_data) {
  switch (ev) {
    case MG_EV_WEBSOCKET_HANDSHAKE_DONE: {
        //printf("-1-1-1\n");
      break;
    }
    case MG_EV_WEBSOCKET_FRAME: {
      struct websocket_message *wm = (struct websocket_message *) ev_data;
      /* New websocket message. Tell everybody. */
      struct mg_str d = {(char *) wm->data, wm->size};

      char id[101],data[500001];
      printf("%s\n",(char *)wm->data);
      strcpy(data,(char *)wm->data);
      printf("%s\n",data);
      int len = strlen(data);
      int flag=0;
      for(int i=0;i<len;i++)
      {
          if(data[i] == '$')
          {
              flag=1;
              break;
          }
          if(data[i] == ' ')
            break;
          id[i] = data[i];
      }
      printf("%s\n",id);
      int len2 = strlen(id);

      if(len2 == len-1 || flag == 1)
      {

        for(int i=0;i<1000;i++)
        {
            if(strlen(hashmap[i].floId) == 0)
            {
                strcpy(hashmap[i].floId,id);
                hashmap[i].connPointer = nc;
                break;
            }
        }

      }
      //printf("%d %d\n",len2,len-1);
      if(len2 != len-1 && flag == 0)
        broadcast(nc,d,id);

      break;
    }
    case MG_EV_HTTP_REQUEST: {
      mg_serve_http(nc, (struct http_message *) ev_data, s_http_server_opts);
      break;
    }
    case MG_EV_CLOSE: {

      if (is_websocket(nc)) {

       printf("Disconnect\n");
       for(int i=0;i<1000;i++)
       {
           if(hashmap[i].connPointer == nc)
           {
               printf("Matched\n");
               strcpy(hashmap[i].floId,"");
               break;
           }
       }
      }
      break;
    }
  }
}

int main(void) {
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
