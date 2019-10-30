const path = require('path');

module.exports = {
    mode: 'development',
    stats: 'verbose',
    entry: './src/js/tabs/receiver_calibration.tsx',
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
                exclude: /node_modules/
            },
            {
                test: /\.css$/i,
                use: [
                    'style-loader',
                    {
                        loader: 'css-loader',
                        options: {
                            modules: true,
                        },
                    }
                ]
            },
        ]
    },
    resolve: {
        extensions: ['.tsx', '.ts', ".js", ".css"]
    },
    output: {
        filename: 'receiver_calibration.js',
        path: path.resolve(__dirname, 'dist/js/tabs')
    },
    devtool: 'inline-source-map',
};
