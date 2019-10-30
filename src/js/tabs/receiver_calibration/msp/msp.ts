import {useState, useEffect} from "react";
import useInterval from "../hooks/useInterval";

function parseRc(data: any): number[] {
    const noOfChannels = data.byteLength / 2;
    return [...Array(noOfChannels).keys()]
        .map(idx => data.getUint8(idx * 2) + data.getUint8((idx * 2) + 1) * 256)
}

function parseRxrangeConfig(data: any): number[][] {
    const noOfChannels = data.getUint8(0);
    return [...Array(noOfChannels).keys()]
        .map(idx => [
                data.getUint8(idx * 4) + 1 + data.getUint8((idx * 4) + 2) * 256,
                data.getUint8((idx * 4) + 3) + data.getUint8((idx * 4) + 4) * 256,
            ]
        );
}

function parseRxMap(data: any) {
    return [...Array(data.byteLength).keys()]
        .map(idx => data.getUint8(idx))
}

function parseMspData(data: any, code: number): any {
    return {
        [MSPCodes.MSP_RC]: parseRc,
        [MSPCodes.MSP_RXRANGE_CONFIG]: parseRxrangeConfig,
        [MSPCodes.MSP_RX_MAP]: parseRxMap,
    }[code](data)
}

export function useMsp(code: number): any {
    const [response, setResponse] = useState(null);

    useEffect(() => {
        MSP.send_message(code, null, null, ({data}: {data: any}) =>
            setResponse(parseMspData(data, code))
        );
    }, []);

    return response;
}

export function useMspPolling(code: number, interval: number): any {
    const [response, setResponse] = useState(null);

    useInterval(() => {
        MSP.send_message(code, null, null, ({data}: {data: any}) =>
            setResponse(parseMspData(data, code))
        );
    }, interval);

    return response;
}

export function setMsp(code: number, payload: any): void {
    MSP.send_message(code, payload);
}
