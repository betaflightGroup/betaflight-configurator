import React, {useEffect, useState} from 'react';
import ChannelDetect from './calibrate/ChannelDetect';
import {setMsp, useMsp, useMspPolling} from "../msp/msp";
import styles from './Calibrate.module.css';
import cx from 'classnames';
import {objectValues} from "../utils";


const CHANNELS = [
  {
    name: 'Throttle',
    code: 'T'
  },
  {
    name: 'Yaw',
    code: 'R'
  },
  {
    name: 'Pitch',
    code: 'E'
  },
  {
    name: 'Roll',
    code: 'A'
  }
];

interface IObjectIndexSignature {
  [code: string]: any
}

interface Props {
  onRestart: () => void
  onDone: () => void
}

const Calibrate: React.FunctionComponent<Props> = ({onRestart, onDone}) => {
  const txValues: number[] = useMspPolling(MSPCodes.MSP_RC, 10);

  const [mins, setMins] = useState([]);
  const [maxs, setMaxs] = useState([]);

  const [detectedChannels, setDetectedChannels] = useState({});
  const [currentChannel, setCurrentChannel] = useState(0);
  const rxRange = useMsp(MSPCodes.MSP_RXRANGE_CONFIG);
  const rxMap = useMsp(MSPCodes.MSP_RX_MAP);

  useEffect(() => {
    if (txValues) {
      const minVals = txValues.map((val: number, i: number) => Math.min(mins[i] || val, val));
      const maxVals = txValues.map((val: number, i: number) => Math.max(maxs[i] || val, val));

      if (!mins.length || mins.some((val: number, i: number) => val !== minVals[i])) {
        setMins(minVals);
      }

      if (!maxs.length || maxs.some((val: number, i: number) => val !== maxVals[i])) {
        setMaxs(maxVals);
      }
    }
  }, [txValues]);


  function detectedChannelsToChannelMapping(detectedChannels: IObjectIndexSignature) {
    const txToChannels: IObjectIndexSignature = Object.keys(detectedChannels)
      .reduce((prev: IObjectIndexSignature, curr: string) => {
        prev[detectedChannels[curr]] = curr;
        return prev;
      }, {});

    return CHANNELS.map((channel, i) => {
      const ch = txToChannels[i];
      return CHANNELS[ch].code;
    });
  }

  function getRxRange() {
    return mins.map((v: number, i: number) => [v, maxs[i]]).slice(0, 4);
  }

  function handleNext() {
    setCurrentChannel(currentChannel + 1);
  }

  function handleDetect(channel: Number) {
    setDetectedChannels({
      ...detectedChannels,
      [currentChannel]: channel
    });
  }

  function handleRestart() {
    onRestart();
  }

  function handleApply() {
    const mapping = detectedChannelsToChannelMapping(detectedChannels);

    setMsp(MSPCodes.MSP_SET_RX_MAP, serializeRxMap(rxMapLettersToNumber(`${mapping.join('')}1234`)));
    setMsp(MSPCodes.MSP_SET_RXRANGE_CONFIG, serializeRxRange(getRxRange()));

    onDone();
  }

  return !txValues ? <div>Loading</div> : <div className={styles.Calibrate}>
    {currentChannel !== CHANNELS.length && txValues.slice(0, 4).map((value: number, i: number) => {
      const channelIsAssigned = objectValues(detectedChannels).indexOf(i);
      return (
        <div key={i} className={styles.txChannelWrapper}>
          <div className={styles.txChannel}>
            <div className={styles.matchedChannel}>
              {channelIsAssigned > -1 && ` ✔ ${CHANNELS[channelIsAssigned].name}`}
            </div>
            <div className={styles.meter}>
              <div
                className={cx(
                  styles.fill,
                  // @ts-ignore
                  styles[`fill${i}`]
                )}
                style={{
                  left: `${((mins[i] - 1000) / 10)}%`,
                  right: `${((2000 - maxs[i]) / 10)}%`
                }}>
              </div>
              <div className={styles.label}>{value}</div>
            </div>
          </div>
        </div>
      )
    })}

    <div className={styles.ChannelDetect}>
      {CHANNELS.map(({name}, i) => {
        return currentChannel === i &&
          <ChannelDetect name={name}
                         txValues={txValues.slice(0, 4)}
                         detectedChannels={detectedChannels}
                         onDetect={handleDetect}
                         key={name} />
      })}

      {currentChannel !== CHANNELS.length &&
      <button onClick={handleRestart} className={cx(
        styles.restartButton,
        "button",
        "button-outline"
      )}>Restart</button>}

      {currentChannel < CHANNELS.length &&
      <button onClick={handleNext} disabled={currentChannel === Object.keys(detectedChannels).length} className={cx(
        styles.nextButton,
        'button'
      )}>
        Next
      </button>}
    </div>

    {currentChannel === CHANNELS.length &&
      <div>
        <div>
          <p>The following settings are ready to be applied:</p>
          <ul>
            <li>rxrange:
              <ul>
                {getRxRange().map(([min, max] : [number, number], i: number) => <li key={i}>{`${min} - ${max}`}</li>)}
              </ul>
            </li>
            <li>Channel mapping: {detectedChannelsToChannelMapping(detectedChannels)}</li>
          </ul>
        </div>
        <button onClick={handleRestart} className={`${styles.restartButton} button button-outline`}>Restart</button>

        <button onClick={handleApply} className="button">Apply settings</button>
      </div>
    }
  </div>
};

export default Calibrate;
