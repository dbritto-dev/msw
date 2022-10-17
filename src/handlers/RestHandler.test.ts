/**
 * @jest-environment jsdom
 */
import {
  RestHandler,
  RestRequestResolverExtras,
  RestRequestParsedResult,
} from './RestHandler'
import { HttpResponse, Request } from '..'
import {
  RequestHandlerExecutionResult,
  ResponseResolver,
} from './RequestHandler'

const resolver: ResponseResolver<
  RestRequestResolverExtras<{ userId: string }>
> = ({ params }) => {
  return HttpResponse.json({ userId: params.userId })
}

describe('info', () => {
  test('exposes request handler information', () => {
    const handler = new RestHandler('GET', '/user/:userId', resolver)

    expect(handler.info.header).toEqual('GET /user/:userId')
    expect(handler.info.method).toEqual('GET')
    expect(handler.info.path).toEqual('/user/:userId')
    expect(handler.isUsed).toBe(false)
  })
})

describe('parse', () => {
  test('parses a URL given a matching request', async () => {
    const handler = new RestHandler('GET', '/user/:userId', resolver)
    const request = new Request(new URL('/user/abc-123', location.href))

    expect(await handler.parse(request)).toEqual({
      match: {
        matches: true,
        params: {
          userId: 'abc-123',
        },
      },
      cookies: {},
    })
  })

  test('parses a URL and ignores the request method', async () => {
    const handler = new RestHandler('GET', '/user/:userId', resolver)
    const request = new Request(new URL('/user/def-456', location.href), {
      method: 'POST',
    })

    expect(await handler.parse(request)).toEqual({
      match: {
        matches: true,
        params: {
          userId: 'def-456',
        },
      },
      cookies: {},
    })
  })

  test('returns negative match result given a non-matching request', async () => {
    const handler = new RestHandler('GET', '/user/:userId', resolver)
    const request = new Request(new URL('/login', location.href))

    expect(await handler.parse(request)).toEqual({
      match: {
        matches: false,
        params: {},
      },
      cookies: {},
    })
  })
})

describe('predicate', () => {
  test('returns true given a matching request', async () => {
    const handler = new RestHandler('POST', '/login', resolver)
    const request = new Request(new URL('/login', location.href), {
      method: 'POST',
    })

    expect(handler.predicate(request, await handler.parse(request))).toBe(true)
  })

  test('respects RegExp as the request method', async () => {
    const handler = new RestHandler(/.+/, '/login', resolver)
    const requests = [
      new Request(new URL('/login', location.href)),
      new Request(new URL('/login', location.href), { method: 'POST' }),
      new Request(new URL('/login', location.href), { method: 'DELETE' }),
    ]

    for (const request of requests) {
      expect(handler.predicate(request, await handler.parse(request))).toBe(
        true,
      )
    }
  })

  test('returns false given a non-matching request', async () => {
    const handler = new RestHandler('POST', '/login', resolver)
    const request = new Request(new URL('/user/abc-123', location.href))

    expect(handler.predicate(request, await handler.parse(request))).toBe(false)
  })
})

describe('test', () => {
  test('returns true given a matching request', async () => {
    const handler = new RestHandler('GET', '/user/:userId', resolver)
    const firstTest = await handler.test(
      new Request(new URL('/user/abc-123', location.href)),
    )
    const secondTest = await handler.test(
      new Request(new URL('/user/def-456', location.href)),
    )

    expect(firstTest).toBe(true)
    expect(secondTest).toBe(true)
  })

  test('returns false given a non-matching request', async () => {
    const handler = new RestHandler('GET', '/user/:userId', resolver)
    const firstTest = await handler.test(
      new Request(new URL('/login', location.href)),
    )
    const secondTest = await handler.test(
      new Request(new URL('/user/', location.href)),
    )
    const thirdTest = await handler.test(
      new Request(new URL('/user/abc-123/extra', location.href)),
    )

    expect(firstTest).toBe(false)
    expect(secondTest).toBe(false)
    expect(thirdTest).toBe(false)
  })
})

describe('run', () => {
  test('returns a mocked response given a matching request', async () => {
    const handler = new RestHandler('GET', '/user/:userId', resolver)
    const request = new Request(new URL('/user/abc-123', location.href))
    const result = await handler.run(request)

    expect(result).toEqual<
      RequestHandlerExecutionResult<RestRequestParsedResult>
    >({
      handler,
      request,
      parsedResult: {
        match: {
          matches: true,
          params: {
            userId: 'abc-123',
          },
        },
        cookies: {},
      },
      response: expect.objectContaining({
        status: 200,
      }),
    })
    expect(await result?.response?.json()).toEqual({ userId: 'abc-123' })
  })

  test('returns null given a non-matching request', async () => {
    const handler = new RestHandler('POST', '/login', resolver)
    const result = await handler.run(
      new Request(new URL('/users', location.href)),
    )

    expect(result).toBeNull()
  })

  test('returns an empty "params" object given request with no URL parameters', async () => {
    const handler = new RestHandler('GET', '/users', resolver)
    const result = await handler.run(
      new Request(new URL('/users', location.href)),
    )

    expect(result?.parsedResult?.match?.params).toEqual({})
  })

  test('exhauses resolver until its generator completes', async () => {
    const handler = new RestHandler('GET', '/users', function* () {
      let count = 0

      while (count < 5) {
        count += 1
        yield HttpResponse.text('pending')
      }

      return HttpResponse.text('complete')
    })

    const run = async () => {
      const result = await handler.run(
        new Request(new URL('/users', location.href)),
      )
      return result?.response?.text()
    }

    expect(await run()).toBe('pending')
    expect(await run()).toBe('pending')
    expect(await run()).toBe('pending')
    expect(await run()).toBe('pending')
    expect(await run()).toBe('pending')
    expect(await run()).toBe('complete')
    expect(await run()).toBe('complete')
  })
})
