import * as Koa from 'koa';
import * as pathToRegexp from 'path-to-regexp';
import * as _ from 'lodash';
const parse: any = require('co-body');
import { parseMulti, MediaType, mediaTypeToString } from './util';
import Controller from './controller';
import Response from './response';
import Context from './context';
import {
  Routes,
  Properties,
  RoutePath,
} from './symbols';


class Router {
  private _routes: {
    method: string;
    path: string[];
    produce: MediaType;
    consume: MediaType;
    pathKeys: pathToRegexp.Key[][];
    pathReg: RegExp[];
    filter: string;
    route: string;
    injection: Function[];
    routerClass: new (...args: any[]) => Controller;
    parameters: {
      index: number;
      type: Function;
      key: string;
      paramType: string;
    }[];
  }[] = [];

  constructor() {
  }

  routes(): (ctx: Koa.Context, next: Function) => Promise<void> {
    let self = this;
    return async function (context: Koa.Context, next: Function): Promise<void> {
      let matchedRoute: any;
      let params: any = {};
      let afters: any[] = [];
      let befores: any[] = [];
      //  Find match routes
      for (let route of self._routes) {
        if (route.filter === 'before') {
          befores.push(route);
        } else if (route.filter === 'after') {
          afters.push(route);
        } else {
          if (route.method === context.method) {
            for (let i = 0; i < route.pathReg.length; i++) {
              let reg = route.pathReg[i];
              let ret = reg.exec(context.path);
              if (ret) {
                matchedRoute = route;
                for (let j = 0; j < route.pathKeys[i].length; j++) {
                  params[route.pathKeys[i][j].name] = ret[j + 1];
                }
                break;
              }
            }
          }
        }
      }

      if (matchedRoute) {
        let parameters: any[] = [];
        let body: { [index: string]: any } = {};

        const contentType = (context.headers['content-type'] || '').split(';');

        // parse body
        if (matchedRoute.consume === MediaType.JSON &&
          contentType.indexOf(mediaTypeToString(MediaType.JSON)) !== -1) {
          body = await new Promise((resolve, reject) => {
            parse.json(context).then(resolve).catch(reject);
          });
        } else if (matchedRoute.consume === MediaType.FORM &&
          contentType.indexOf(mediaTypeToString(MediaType.FORM)) !== -1) {
          body = await new Promise((resolve, reject) => {
            parse.form(context).then(resolve).catch(reject);
          });
        } else if (matchedRoute.consume === MediaType.TEXT &&
          contentType.indexOf(mediaTypeToString(MediaType.TEXT)) !== -1) {
          body = await new Promise((resolve, reject) => {
            parse.text(context).then(resolve).catch(reject);
          });
        } else if (matchedRoute.consume === MediaType.MULTIPART &&
          contentType.indexOf(mediaTypeToString(MediaType.MULTIPART)) !== -1) {
          let result = await parseMulti(context);
          body = {};
          for (let key of Object.keys(result.fields)) {
            body[key] = result.fields[key];
          }
          for (let key of Object.keys(result.files)) {
            body[key] = result.files[key];
          }
        }
        let appContext: Context  = context;
        appContext.requestBody  = body;
        appContext.params       = params;


        let response: Response;
        function getParameter(parameter: any) {
          let ret: any;
          switch (parameter.paramType) {
            case 'query-param':
              ret = _.get(context.query, parameter.key);
              break;
            case 'path-param':
              ret = _.get(params, parameter.key);
              break;
            case 'body-param':
              ret = _.get(body, parameter.key);
              break;
            case 'header-param':
              ret = _.get(context.headers, parameter.key);
              break;
            case 'query':
              ret = context.query;
              break;
            case 'params':
              ret = params;
              break;
            case 'body':
              ret = body;
              break;
            case 'headers':
              ret = context.headers;
              break;
            case 'app-context':
              ret = appContext;
              break;
            case 'http-context':
              ret = context;
              break;
            case 'response':
              ret = response;
              break;
            default:
          }
          if ([Object, String, Date, Number, Boolean].indexOf(parameter.type) !== -1) {
            return parameter.type(ret);
          } else if ([Response].indexOf(parameter.type) !== -1) {
            return ret;
          } else {
            return new parameter.type(ret);
          }
        }

        for (let parameter of matchedRoute.parameters || []) {
          parameters.push(getParameter(parameter));
        }
        let klass = matchedRoute.routerClass;
        for (let key of Object.keys(klass.prototype[Properties])) {
          klass.prototype[key] = getParameter(klass.prototype[Properties][key]);
        }

        let router = new klass();

        for (let before of befores) {
          let p: any[] = [];
          for (let parameter of before.parameters || []) {
            p.push(getParameter(parameter));
          }
          await router[before.route](...p);
        }

        const injections = matchedRoute.injection || [];
        for (const injection of injections) {
          await injection(appContext);
        }

        response = await router[matchedRoute.route](...parameters);

        switch (matchedRoute.produce) {
          case MediaType.JSON:
            response.body = JSON.stringify(response.body);
            response.headers['Content-Type'] = mediaTypeToString(matchedRoute.produce);
            break;
          default:
        }

        response.send(appContext);

        for (let after of afters) {
          let p: any[] = [];
          for (let parameter of after.parameters || []) {
            p.push(getParameter(parameter));
          }
          await router[after.route](...p);
        }
        await next();
      }
    };
  }

  use<T extends Controller>(RouterClass: new (...args: any[]) => T) {
    let router = RouterClass.prototype;
    for (let key of Object.keys(router[Routes])) {
      let route = router[Routes][key];

      let pathReg: pathToRegexp.PathRegExp[] = [];
      let pathKeys: pathToRegexp.Key[][] = [];
      for (let path of route.path || []) {
        let keys: pathToRegexp.Key[] = [];
        let reg = pathToRegexp(router[RoutePath] + path, keys);
        pathReg.push(reg);
        pathKeys.push(keys);
      }
      this._routes.push({
        routerClass: RouterClass,
        method: route.method,
        path: (route.path || []).map((p: any) => router[RoutePath] + p),
        produce: route.produce,
        consume: route.consume,
        injection: route.injection,
        filter: route.filter,
        route: key,
        pathReg,
        pathKeys,
        parameters: route.parameters,
      });
    }
  }
}

export default Router;
