let SerialPort;
try {
  const mod = await import('serialport');
  SerialPort = mod.SerialPort;
} catch {}

export function handleSerial(ws, config) {
  const port = config.serial_port || 'COM1';
  const baud = config.serial_baud || 115200;
  const dataBits = config.serial_dataBits || 8;
  const stopBits = config.serial_stopBits || 1;
  const parity = config.serial_parity || 'none';
  const tag = `[SERIAL ${port}]`;
  const log = (m) => console.log(`${tag} ${m}`);
  const cleanup = () => { try { ws.close(1000); } catch {} };

  if (!SerialPort) {
    log('SerialPort module not available');
    ws.send(JSON.stringify({ type: 'error', message: 'Serial port support is not available. Install the "serialport" package or use a different protocol.' }));
    cleanup();
    return;
  }

  let sp = null;
  try {
    sp = new SerialPort({ path: port, baudRate: baud, dataBits, stopBits, parity }, (err) => {
      if (err) {
        log('Open error: ' + err.message);
        try { ws.send(JSON.stringify({ type: 'error', message: err.message })); } catch {}
        cleanup();
        return;
      }
      log('Opened ' + port + ' @ ' + baud + ' baud');
      ws.send(JSON.stringify({ type: 'status', message: 'connected' }));
    });
    const onWsMsg = (input) => { if (sp?.writable) sp.write(input.toString()); };
    ws.on('message', onWsMsg);
    sp.on('data', (c) => { if (ws.readyState === 1) ws.send(c.toString()); });
    sp.on('error', (err) => {
      log('Error: ' + err.message);
      try { ws.send(JSON.stringify({ type: 'error', message: err.message })); } catch {}
    });
    sp.on('close', () => {
      log('Port closed');
      ws.removeListener('message', onWsMsg);
      cleanup();
    });
    ws.on('close', () => {
      log('WS closed');
      try { sp?.close(); } catch {}
      ws.removeListener('message', onWsMsg);
    });
  } catch (e) {
    log('Failed: ' + e.message);
    try { ws.send(JSON.stringify({ type: 'error', message: e.message })); } catch {}
    cleanup();
  }
}
