// Local stand-in for the Anthropic Messages API (streaming only), for offline UI tests.
// Usage: node test/mock-anthropic.mjs 4010, then start the server with ANTHROPIC_BASE_URL=http://localhost:4010
import http from 'node:http';

const port = Number(process.argv[2] || 4010);
http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', async () => {
    const reqJson = JSON.parse(body || '{}');
    const isChat = /<workspace>/.test(reqJson.system || '');
    const text = isChat
      ? 'Per [[Weekly Sync — Product]], two things are in progress:\n\n- **Pricing page copy** (Maya)\n- **Onboarding checklist v2**\n\n- [ ] Follow up with Sam on staging capacity'
      : '## Summary\n\nThe team is preparing the **Q4 launch**.\n\n- Pricing copy is nearly done\n- Onboarding v2 ships next\n- [ ] Book the launch video shoot';
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const ev = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
    ev('message_start', { message: { id: 'msg_mock', model: reqJson.model } });
    ev('content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
    for (const chunk of text.match(/[\s\S]{1,12}/g)) {
      ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text: chunk } });
      await new Promise((r) => setTimeout(r, 15));
    }
    ev('content_block_stop', { index: 0 });
    ev('message_stop', {});
    res.end();
  });
}).listen(port, () => console.log('mock anthropic on', port));
