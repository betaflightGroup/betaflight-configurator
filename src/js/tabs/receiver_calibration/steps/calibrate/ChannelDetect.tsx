import React, {useState} from 'react';
import {objectValues} from "../../utils";

const MATCH_THRESHOLD = 450;

interface Props {
  name: string
  txValues: number[]
  detectedChannels: Object
  onDetect: (match: number) => void
}

const ChannelDetect: React.FunctionComponent<Props> = ({name, txValues, detectedChannels, onDetect}) => {
  const [initialTxValues, setCurrentTxValues] = useState(txValues);

  function anyValuesMeetThreshold(currentValues: Array<number>, newValues: Array<number>) {
    return currentValues.findIndex((channel: number, i: number) => {
      return Math.abs(channel - newValues[i]) > MATCH_THRESHOLD
    })
  }

  const match = anyValuesMeetThreshold(initialTxValues, txValues);

  if (match > -1) {
    objectValues(detectedChannels).indexOf(match) === -1 && onDetect(match);
  }

  return (
    <p>Please move <strong>{name}</strong> to its extremes, then click next</p>
  )
};

export default ChannelDetect;
