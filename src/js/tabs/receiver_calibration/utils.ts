interface IObjectIndexSignature {
    [code: string]: any
}

export const objectValues = (object: IObjectIndexSignature) => Object.keys(object).map(k => object[k]);
