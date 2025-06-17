import { registerPlugin } from '@capacitor/plugin';

import type {
  NDEFMessagesTransformable,
  NDEFWriteOptions,
  NFCPlugin,
  NFCPluginBasic,
  PayloadType,
  TagResultListenerFunc,
  NFCError,
  NDEFMessages
} from './definitions';

const NFCPlug = registerPlugin<NFCPluginBasic>('NFC', {
  web: () => import('./web').then(m => new m.NFCWeb()),
});

export * from './definitions';

export const NFC: NFCPlugin = {
  isSupported: NFCPlug.isSupported.bind(NFCPlug),
  startScan: NFCPlug.startScan.bind(NFCPlug),
  cancelWriteAndroid: NFCPlug.cancelWriteAndroid.bind(NFCPlug),
  onRead: (func: TagResultListenerFunc) => NFC.wrapperListeners.push(func),
  onWrite: (func: ()=> void) => NFCPlug.addListener(`nfcWriteSuccess`, func),
  onError: (errorFn: (error: NFCError) => void) => {
    NFCPlug.addListener(`nfcError`, errorFn);
  },
  removeAllListeners: (eventName: 'nfcTag' | 'nfcError') => {
    NFC.wrapperListeners = [];
    return NFCPlug.removeAllListeners(eventName);
  },
  wrapperListeners: [],

  async writeNDEF<T extends PayloadType = Uint8Array>(options?: NDEFWriteOptions<T>): Promise<void> {
    const ndefMessage: NDEFWriteOptions<number[]> = {
      records:
        options?.records.map((record) => {
          const payload: number[] | null =
            typeof record.payload === 'string'
              ? Array.from(new TextEncoder().encode(record.payload))
              : Array.isArray(record.payload)
                ? record.payload
                : record.payload instanceof Uint8Array
                  ? Array.from(record.payload)
                  : null;

          if (!payload) throw 'Unsupported payload type';

          return {
            type: record.type,
            payload,
          };
        }) ?? [],
    };

    await NFCPlug.writeNDEF(ndefMessage);
  },
};

type DecodeSpecifier = "b64" | "string" | "uint8Array" | "numberArray";
type decodedType<T extends DecodeSpecifier> = NDEFMessages<T extends "b64" ? string : T extends "string" ? string : T extends "uint8Array" ? Uint8Array : number[]>
const decodeBase64 = (base64Payload: string)=> {
  return atob(base64Payload)
    .split('')
    .map((char) => char.charCodeAt(0));
}
const mapPayloadTo = <T extends DecodeSpecifier>(type: T, data: NDEFMessages): decodedType<T> => {
  return {
    messages: data.messages.map(message => ({
      records: message.records.map(record => ({
        type: record.type,
        payload:
          type === "b64"
            ? record.payload
            :type === "string"
              ? decodeBase64(record.payload)
              : type === "uint8Array"
                ? new Uint8Array(decodeBase64(record.payload))
                : type === "numberArray"
                  ? Array.from(decodeBase64(record.payload))
                  : record.payload
      }))
    }))
  } as decodedType<T>
}

NFCPlug.addListener(`nfcTag`, data=> {
  const wrappedData: NDEFMessagesTransformable = {
    base64() {
      return mapPayloadTo("b64", data)
    },
    string() {
      return mapPayloadTo("string", data)
    },
    uint8Array() {
      return mapPayloadTo("uint8Array", data)
    },
    numberArray() {
      return mapPayloadTo("numberArray", data)
    }
  }

  for(const listener of NFC.wrapperListeners) {
    listener(wrappedData);
  }
})