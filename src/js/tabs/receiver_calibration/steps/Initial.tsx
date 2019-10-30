import React from 'react';
import {useMsp, setMsp} from "../msp/msp";
import styles from './Initial.module.css';

const DEFAULT_RX_RANGE_MIN = 1000;
const DEFAULT_RX_RANGE_MAX = 2000;

interface Props {
  onStart: () => void
}

const Initial: React.FunctionComponent<Props> = ({onStart}) => {
  const rxRanges = useMsp(MSPCodes.MSP_RXRANGE_CONFIG);

  const isRxRangeDefault = (channels: Array<Array<number>>) =>
      channels.every(([min, max]) => min === DEFAULT_RX_RANGE_MIN && max === DEFAULT_RX_RANGE_MAX);

  function handleStart() {
    if (!isRxRangeDefault(rxRanges)) {
      setMsp(
          MSPCodes.MSP_SET_RXRANGE_CONFIG,
          serializeRxRange(rxRanges.map(() => [DEFAULT_RX_RANGE_MIN, DEFAULT_RX_RANGE_MAX]))
      )
    }
    onStart();
  }

  return !rxRanges ? <div>Loading</div> : <div>
    <p>Before you start:</p>
    <ol>
      {!isRxRangeDefault(rxRanges) && <li>Your rxrange setting has custom values. Running this calibration will reset these</li>}
      <li>It is recommended that you reset any custom endpoints and/or trims on your transmitter</li>
      <li>Power up you receiver and transmitter (Don't forget to remove your props)</li>
    </ol>

    <div className={styles.buttons}>
      <button onClick={handleStart} className="button">Start Calibration</button>
    </div>

    {rxRanges.map(([min, max]: [number, number], i: number) => <div key={i}>{min} - {max}</div>)}
  </div>
};

export default Initial;
