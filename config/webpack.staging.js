const HtmlWebpackPlugin = require('html-webpack-plugin');
const Dotenv = require('dotenv-webpack');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const { merge } = require('webpack-merge');
const config = require('./webpack.config.js');
const PATHS = require('./paths');

module.exports = merge(config, {
  mode: 'staging',
  plugins: [
    // Copy static assets from `public` folder to `build` folder
    new CopyWebpackPlugin({
      patterns: [
        {
          from: '**/*',
          context: 'public',
        },
      ],
    }),
    // Generate `popup.html` file from `popup.html` template
    new HtmlWebpackPlugin({
      template: PATHS.src + '/popup.html',
      filename: 'popup.html',
    }),
    // Extract CSS into separate files
    new MiniCssExtractPlugin({
      filename: '[name].css',
    }),
    // Load environment variables from .env file
    new Dotenv({ path: './staging.env' }),
  ],
});
