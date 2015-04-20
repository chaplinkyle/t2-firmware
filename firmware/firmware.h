#pragma once
#include "common/board.h"
#include "common/hw.h"
#include "samd/usb_samd.h"

/// DMA allocation. Channels 0-3 support EVSYS and are reserved for
/// functions that need it
#define DMA_TERMINAL_RX 0
#define DMA_BRIDGE_TX 4
#define DMA_BRIDGE_RX 5
#define DMA_PORT_A_TX 6
#define DMA_PORT_A_RX 7
#define DMA_PORT_B_TX 8
#define DMA_PORT_B_RX 9
#define DMA_TERMINAL_TX 10


// overlaps with flash because they cannot be active at the same time
#define DMA_FLASH_TX DMA_BRIDGE_TX
#define DMA_FLASH_RX DMA_BRIDGE_RX

/// EVSYS allocation
#define EVSYS_BRIDGE_SYNC 0
#define EVSYS_TERMINAL_TIMEOUT 1

/// USB Endpoint allocation
#define USB_EP_FLASH_OUT 0x02
#define USB_EP_FLASH_IN 0x81

#define USB_EP_PIPE_OUT USB_EP_FLASH_OUT
#define USB_EP_PIPE_IN USB_EP_FLASH_IN

#define USB_EP_CDC_NOTIFICATION 0x83
#define USB_EP_CDC_IN           0x84
#define USB_EP_CDC_OUT          0x04

/// Timer allocation
#define TC_TERMINAL_TIMEOUT 3
#define TC_DELAY_CALLBACK   4  // timer used for ms delays

// GCLK channel allocation
#define GCLK_SYSTEM 0
#define GCLK_32K    2
#define GCLK_PORT_A 3
#define GCLK_PORT_B 4

// flash.c

void flash_init();
void flash_dma_rx_completion();
void flash_usb_in_completion();
void flash_usb_out_completion();
void flash_disable();

// bridge.c

#define BRIDGE_NUM_CHAN 3
#define BRIDGE_USB 0
#define BRIDGE_PORT_A 1
#define BRIDGE_PORT_B 2
#define BRIDGE_BUF_SIZE 256
#define BRIDGE_ARG_SIZE 5

void bridge_init();
void bridge_disable();
void bridge_handle_sync();
void bridge_dma_rx_completion();

void bridge_start_in(u8 channel, u8* data, u8 length);
void bridge_start_out(u8 channel, u8* data);

void bridge_completion_in_0();
void bridge_completion_in_1();
void bridge_completion_in_2();
void bridge_completion_in_3();

void bridge_completion_out_0(u8 size);
void bridge_completion_out_1(u8 size);
void bridge_completion_out_2(u8 size);
void bridge_completion_out_3(u8 size);

void bridge_open_0();
void bridge_open_1();
void bridge_open_2();
void bridge_open_3();

void bridge_close_0();
void bridge_close_1();
void bridge_close_2();
void bridge_close_3();

// port.c

#define UART_MS_TIMEOUT 10 // send uart data after ms timeout even if buffer is not full
#define UART_RX_SIZE 20
#define RX_BUF_INCR(pos)  (pos=((++pos) == (UART_RX_SIZE - 1) ? 0 : pos))

typedef struct UartBuf {
    u8 head;
    u8 tail;
    u8 buf_len;
    u8 rx[UART_RX_SIZE];
    u8 data_pos; // 255 = no uart data has been passed
} UartBuf; 

typedef struct PortData {
    u8 chan;
    const TesselPort* port;
    DmaChan dma_tx;
    DmaChan dma_rx;

    u8 state;
    u8 mode;
    u8 cmd_buf[BRIDGE_BUF_SIZE];
    u8 cmd_len;
    u8 cmd_pos;
    u8 reply_buf[BRIDGE_BUF_SIZE];
    u8 reply_len;
    u8 cmd;
    u8 arg[BRIDGE_ARG_SIZE];
    u8 arg_len;
    u8 arg_pos;
    u8 len;
    u8 clock_channel;
    bool pending_out;
    bool pending_in;
    UartBuf uart_buf;
} PortData;

// main ports
extern PortData port_a;
extern PortData port_b;

void port_init(PortData* p, u8 chan, const TesselPort* port, u8 clock_channel, DmaChan dma_tx, DmaChan dma_rx);
void port_enable(PortData *p);
void port_bridge_out_completion(PortData* p, u8 len);
void port_bridge_in_completion(PortData* p);
void port_dma_rx_completion(PortData* p);
void port_dma_tx_completion(PortData* p);
void bridge_handle_sercom_uart_i2c(PortData* p);
void port_handle_extint(PortData *p, u32 flags);
void port_disable(PortData *p);

// usbpipe.c

void usbpipe_init();
void usbpipe_disable();
void pipe_usb_out_completion();
void pipe_bridge_in_completion();
void pipe_bridge_out_completion(u8 count);
void pipe_usb_in_completion();

// usbserial.c

void usbserial_init();
void usbserial_out_completion();
void usbserial_in_completion();
void usbserial_dma_rx_completion();
void usbserial_dma_tx_completion();
void usbserial_handle_tc();
