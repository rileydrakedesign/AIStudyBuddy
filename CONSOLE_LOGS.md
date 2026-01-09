2026-01-09T19:29:07.972827+00:00 app[web.1]: |   File "/app/.heroku/python/lib/python3.11/site-packages/starlette/middleware/base.py", line 149, in coro
2026-01-09T19:29:07.972827+00:00 app[web.1]: |     await self.app(scope, receive_or_disconnect, send_no_error)
2026-01-09T19:29:07.972827+00:00 app[web.1]: |   File "/app/.heroku/python/lib/python3.11/site-packages/starlette/middleware/exceptions.py", line 62, in __call__
2026-01-09T19:29:07.972827+00:00 app[web.1]: |     await wrap_app_handling_exceptions(self.app, conn)(scope, receive, send)
2026-01-09T19:29:07.972827+00:00 app[web.1]: |   File "/app/.heroku/python/lib/python3.11/site-packages/starlette/_exception_handler.py", line 53, in wrapped_app
2026-01-09T19:29:07.972827+00:00 app[web.1]: |     raise exc
2026-01-09T19:29:07.972828+00:00 app[web.1]: |   File "/app/.heroku/python/lib/python3.11/site-packages/starlette/_exception_handler.py", line 42, in wrapped_app
2026-01-09T19:29:07.972828+00:00 app[web.1]: |     await app(scope, receive, sender)
2026-01-09T19:29:07.972828+00:00 app[web.1]: |   File "/app/.heroku/python/lib/python3.11/site-packages/starlette/routing.py", line 715, in __call__
2026-01-09T19:29:07.972828+00:00 app[web.1]: |     await self.middleware_stack(scope, receive, send)
2026-01-09T19:29:07.972828+00:00 app[web.1]: |   File "/app/.heroku/python/lib/python3.11/site-packages/starlette/routing.py", line 735, in app
2026-01-09T19:29:07.972828+00:00 app[web.1]: |     await route.handle(scope, receive, send)
2026-01-09T19:29:07.972828+00:00 app[web.1]: |   File "/app/.heroku/python/lib/python3.11/site-packages/starlette/routing.py", line 288, in handle
2026-01-09T19:29:07.972829+00:00 app[web.1]: |     await self.app(scope, receive, send)
2026-01-09T19:29:07.972829+00:00 app[web.1]: |   File "/app/.heroku/python/lib/python3.11/site-packages/starlette/routing.py", line 76, in app
2026-01-09T19:29:07.972829+00:00 app[web.1]: |     await wrap_app_handling_exceptions(app, request)(scope, receive, send)
2026-01-09T19:29:07.972829+00:00 app[web.1]: |   File "/app/.heroku/python/lib/python3.11/site-packages/starlette/_exception_handler.py", line 53, in wrapped_app
2026-01-09T19:29:07.972829+00:00 app[web.1]: |     raise exc
2026-01-09T19:29:07.972829+00:00 app[web.1]: |   File "/app/.heroku/python/lib/python3.11/site-packages/starlette/_exception_handler.py", line 42, in wrapped_app
2026-01-09T19:29:07.972829+00:00 app[web.1]: |     await app(scope, receive, sender)
2026-01-09T19:29:07.972829+00:00 app[web.1]: |   File "/app/.heroku/python/lib/python3.11/site-packages/starlette/routing.py", line 74, in app
2026-01-09T19:29:07.972830+00:00 app[web.1]: |     await response(scope, receive, send)
2026-01-09T19:29:07.972830+00:00 app[web.1]: |   File "/app/.heroku/python/lib/python3.11/site-packages/starlette/responses.py", line 252, in __call__
2026-01-09T19:29:07.972830+00:00 app[web.1]: |     async with anyio.create_task_group() as task_group:
2026-01-09T19:29:07.972833+00:00 app[web.1]: |   File "/app/.heroku/python/lib/python3.11/site-packages/anyio/_backends/_asyncio.py", line 680, in __aexit__
2026-01-09T19:29:07.972834+00:00 app[web.1]: |     raise BaseExceptionGroup(
2026-01-09T19:29:07.972834+00:00 app[web.1]: | ExceptionGroup: unhandled errors in a TaskGroup (1 sub-exception)
2026-01-09T19:29:07.972834+00:00 app[web.1]: +-+---------------- 1 ----------------
2026-01-09T19:29:07.972834+00:00 app[web.1]: | Traceback (most recent call last):
2026-01-09T19:29:07.972834+00:00 app[web.1]: |   File "/app/.heroku/python/lib/python3.11/site-packages/uvicorn/protocols/http/h11_impl.py", line 408, in run_asgi
2026-01-09T19:29:07.972834+00:00 app[web.1]: |     result = await app(  # type: ignore[func-returns-value]
2026-01-09T19:29:07.972834+00:00 app[web.1]: |              ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
2026-01-09T19:29:07.972835+00:00 app[web.1]: |   File "/app/.heroku/python/lib/python3.11/site-packages/uvicorn/middleware/proxy_headers.py", line 84, in __call__
2026-01-09T19:29:07.972835+00:00 app[web.1]: |     return await self.app(scope, receive, send)
2026-01-09T19:29:07.972835+00:00 app[web.1]: |            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
2026-01-09T19:29:07.972835+00:00 app[web.1]: |   File "/app/.heroku/python/lib/python3.11/site-packages/fastapi/applications.py", line 1054, in __call__
2026-01-09T19:29:07.972835+00:00 app[web.1]: |     await super().__call__(scope, receive, send)
2026-01-09T19:29:07.972835+00:00 app[web.1]: |   File "/app/.heroku/python/lib/python3.11/site-packages/starlette/applications.py", line 113, in __call__
2026-01-09T19:29:07.972835+00:00 app[web.1]: |     await self.middleware_stack(scope, receive, send)
2026-01-09T19:29:07.972835+00:00 app[web.1]: |   File "/app/.heroku/python/lib/python3.11/site-packages/starlette/middleware/errors.py", line 187, in __call__
2026-01-09T19:29:07.972836+00:00 app[web.1]: |     raise exc
2026-01-09T19:29:07.972836+00:00 app[web.1]: |   File "/app/.heroku/python/lib/python3.11/site-packages/starlette/middleware/errors.py", line 165, in __call__
2026-01-09T19:29:07.972836+00:00 app[web.1]: |     await self.app(scope, receive, _send)
2026-01-09T19:29:07.972836+00:00 app[web.1]: |   File "/app/.heroku/python/lib/python3.11/site-packages/starlette/middleware/base.py", line 185, in __call__
2026-01-09T19:29:07.972836+00:00 app[web.1]: |     with collapse_excgroups():
2026-01-09T19:29:07.972836+00:00 app[web.1]: |   File "/app/.heroku/python/lib/python3.11/contextlib.py", line 158, in __exit__
2026-01-09T19:29:07.972836+00:00 app[web.1]: |     self.gen.throw(typ, value, traceback)
2026-01-09T19:29:07.972837+00:00 app[web.1]: |   File "/app/.heroku/python/lib/python3.11/site-packages/starlette/_utils.py", line 82, in collapse_excgroups
2026-01-09T19:29:07.972837+00:00 app[web.1]: |     raise exc
2026-01-09T19:29:07.972837+00:00 app[web.1]: |   File "/app/.heroku/python/lib/python3.11/site-packages/starlette/responses.py", line 255, in wrap
2026-01-09T19:29:07.972837+00:00 app[web.1]: |     await func()
2026-01-09T19:29:07.972839+00:00 app[web.1]: |   File "/app/.heroku/python/lib/python3.11/site-packages/starlette/responses.py", line 244, in stream_response
2026-01-09T19:29:07.972839+00:00 app[web.1]: |     async for chunk in self.body_iterator:
2026-01-09T19:29:07.972839+00:00 app[web.1]: |   File "/app/semantic_search.py", line 2215, in token_generator
2026-01-09T19:29:07.972839+00:00 app[web.1]: |     log.error(f"[STREAM] ERROR: {e}", exc_info=True)
2026-01-09T19:29:07.972839+00:00 app[web.1]: |   File "/app/.heroku/python/lib/python3.11/site-packages/loguru/_logger.py", line 2090, in error
2026-01-09T19:29:07.972839+00:00 app[web.1]: |     __self._log("ERROR", False, __self._options, __message, args, kwargs)
2026-01-09T19:29:07.972840+00:00 app[web.1]: |   File "/app/.heroku/python/lib/python3.11/site-packages/loguru/_logger.py", line 2055, in _log
2026-01-09T19:29:07.972840+00:00 app[web.1]: |     log_record["message"] = message.format(*args, **kwargs)
2026-01-09T19:29:07.972840+00:00 app[web.1]: |                             ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
2026-01-09T19:29:07.972840+00:00 app[web.1]: | KeyError: "'bmatrix'"
2026-01-09T19:29:07.972841+00:00 app[web.1]: +------------------------------------
2026-01-09T19:29:07.972841+00:00 app[web.1]: 
2026-01-09T19:29:07.972841+00:00 app[web.1]: During handling of the above exception, another exception occurred:
2026-01-09T19:29:07.972841+00:00 app[web.1]: 
2026-01-09T19:29:07.972841+00:00 app[web.1]: Traceback (most recent call last):
2026-01-09T19:29:07.972842+00:00 app[web.1]: File "/app/.heroku/python/lib/python3.11/site-packages/uvicorn/protocols/http/h11_impl.py", line 408, in run_asgi
2026-01-09T19:29:07.972842+00:00 app[web.1]: result = await app(  # type: ignore[func-returns-value]
2026-01-09T19:29:07.972842+00:00 app[web.1]: ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
2026-01-09T19:29:07.972842+00:00 app[web.1]: File "/app/.heroku/python/lib/python3.11/site-packages/uvicorn/middleware/proxy_headers.py", line 84, in __call__
2026-01-09T19:29:07.972842+00:00 app[web.1]: return await self.app(scope, receive, send)
2026-01-09T19:29:07.972842+00:00 app[web.1]: ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
2026-01-09T19:29:07.972843+00:00 app[web.1]: File "/app/.heroku/python/lib/python3.11/site-packages/fastapi/applications.py", line 1054, in __call__
2026-01-09T19:29:07.972843+00:00 app[web.1]: await super().__call__(scope, receive, send)
2026-01-09T19:29:07.972843+00:00 app[web.1]: File "/app/.heroku/python/lib/python3.11/site-packages/starlette/applications.py", line 113, in __call__
2026-01-09T19:29:07.972843+00:00 app[web.1]: await self.middleware_stack(scope, receive, send)
2026-01-09T19:29:07.972843+00:00 app[web.1]: File "/app/.heroku/python/lib/python3.11/site-packages/starlette/middleware/errors.py", line 187, in __call__
2026-01-09T19:29:07.972843+00:00 app[web.1]: raise exc
2026-01-09T19:29:07.972843+00:00 app[web.1]: File "/app/.heroku/python/lib/python3.11/site-packages/starlette/middleware/errors.py", line 165, in __call__
2026-01-09T19:29:07.972843+00:00 app[web.1]: await self.app(scope, receive, _send)
2026-01-09T19:29:07.972844+00:00 app[web.1]: File "/app/.heroku/python/lib/python3.11/site-packages/starlette/middleware/base.py", line 185, in __call__
2026-01-09T19:29:07.972844+00:00 app[web.1]: with collapse_excgroups():
2026-01-09T19:29:07.972844+00:00 app[web.1]: File "/app/.heroku/python/lib/python3.11/contextlib.py", line 158, in __exit__
2026-01-09T19:29:07.972844+00:00 app[web.1]: self.gen.throw(typ, value, traceback)
2026-01-09T19:29:07.972844+00:00 app[web.1]: File "/app/.heroku/python/lib/python3.11/site-packages/starlette/_utils.py", line 82, in collapse_excgroups
2026-01-09T19:29:07.972844+00:00 app[web.1]: raise exc
2026-01-09T19:29:07.972844+00:00 app[web.1]: File "/app/.heroku/python/lib/python3.11/site-packages/starlette/responses.py", line 255, in wrap
2026-01-09T19:29:07.972844+00:00 app[web.1]: await func()
2026-01-09T19:29:07.972845+00:00 app[web.1]: File "/app/.heroku/python/lib/python3.11/site-packages/starlette/responses.py", line 244, in stream_response
2026-01-09T19:29:07.972845+00:00 app[web.1]: async for chunk in self.body_iterator:
2026-01-09T19:29:07.972845+00:00 app[web.1]: File "/app/semantic_search.py", line 2215, in token_generator
2026-01-09T19:29:07.972845+00:00 app[web.1]: log.error(f"[STREAM] ERROR: {e}", exc_info=True)
2026-01-09T19:29:07.972845+00:00 app[web.1]: File "/app/.heroku/python/lib/python3.11/site-packages/loguru/_logger.py", line 2090, in error
2026-01-09T19:29:07.972845+00:00 app[web.1]: __self._log("ERROR", False, __self._options, __message, args, kwargs)
2026-01-09T19:29:07.972845+00:00 app[web.1]: File "/app/.heroku/python/lib/python3.11/site-packages/loguru/_logger.py", line 2055, in _log
2026-01-09T19:29:07.972845+00:00 app[web.1]: log_record["message"] = message.format(*args, **kwargs)
2026-01-09T19:29:07.972846+00:00 app[web.1]: ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
2026-01-09T19:29:07.972846+00:00 app[web.1]: KeyError: "'bmatrix'"
2026-01-09T19:29:07.973289+00:00 heroku[router]: sock=backend at=error code=H18 desc="Server Request Interrupted" method=POST path="/api/v1/semantic_search_stream" host=class-chat-python-f081e08f29b8.herokuapp.com request_id=32703692-2362-4363-b46a-92c695c1d6b1 fwd="100.27.26.255" dyno=web.1 connect=0ms service=710ms status=200 bytes=0 protocol=http1.1 tls=true tls_version=unknown
2026-01-09T19:29:49.000000+00:00 app[heroku-redis]: source=REDIS addon=redis-rugged-24473 sample#active-connections=4 sample#max-connections=18 sample#connection-percentage-used=0.22222 sample#load-avg-1m=1.51 sample#load-avg-5m=1.09 sample#load-avg-15m=1.135 sample#read-iops=0 sample#write-iops=0 sample#max-iops=3000 sample#iops-percentage-used=0.00000 sample#memory-total=16167800kB sample#memory-free=10693340kB sample#memory-percentage-used=0.33860 sample#memory-cached=979072kB sample#memory-redis=5116080bytes sample#hit-rate=0.0013079 sample#evicted-keys=0
