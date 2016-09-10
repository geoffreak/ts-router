import Cookie from './cookie';
import * as Koa from 'koa';
const formy: any = require('formidable');
export enum MediaType {
  TEXT,
  JSON,
  FORM,
  MULTIPART
}
export enum HttpMethod {
  GET,
  POST,
  PUT,
  DELETE
}
export enum Charset {
  UTF8
}
export function mediaTypeToString(type: MediaType): string {
  switch (type) {
    case MediaType.TEXT:
      return 'text/plain';
    case MediaType.JSON:
      return 'application/json';
    case MediaType.FORM:
      return 'application/x-www-form-urlencoded';
    case MediaType.MULTIPART:
      return 'multipart/form-data';
    default:
      throw new Error('Unknown media type');
  }
}
export interface Context extends Koa.Context {
  cookie: Cookie;
}

/// <reference path="../node_modules/reflect-metadata/reflect-metadata.d.ts"/>
import 'reflect-metadata';
export class ReflectType {
  static TYPE: string = 'design:type';
  static PARAMETER_TYPE: string = 'design:paramtypes';
  static RETURN_TYPE: string = 'design:returntype';
}


export function parseMulti(ctx: Koa.Context, opts?: any): Promise<any> {
  opts = opts || {};
  return new Promise<any>((resolve, reject) => {
    let fields: { [index: string]: any } = {};
    let files: { [index: string]: any } = {};
    let form = new formy.IncomingForm(opts);
    form
      .on('end', () => resolve({ fields, files }))
      .on('error', (err: Error) => reject(err))
      .on('field', (field: any, value: any) => {
        if (fields[field]) {
          if (files[field] instanceof Array) {
            fields[field].push(value);
          } else {
            fields[field] = [fields[field], value];
          }
        } else {
          fields[field] = value;
        }
      })
      .on('file', (field: any, file: any) => {
        if (files[field]) {
          if (files[field] instanceof Array) {
            files[field].push(file);
          } else {
            files[field] = [files[field], file];
          }
        } else {
          files[field] = file;
        }
      });
    if (opts.onFileBegin) {
      form.on('fileBegin', opts.onFileBegin);
    }
    form.parse(ctx.req);
   });
}
