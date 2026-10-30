import {createHandler} from '../src/server.js';

const handler = createHandler();
// Vercel rewrites carry the original API path explicitly, regardless of req.url normalization.
export default function vercelHandler(req, res) {
 const url = new URL(req.url, 'http://localhost');
 const route = url.searchParams.get('__ahpu_route');
 if (route !== null) {
  url.pathname = '/api/' + route;
  url.searchParams.delete('__ahpu_route');
  req.url = url.pathname + url.search;
 }
 return handler(req, res);
}
