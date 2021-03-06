'use strict';

/**
 * Module dependencies
 */

// Public node modules.
const BufferStream = require('./BufferStream');

const {
  Aborter,
  BlobURL,
  BlockBlobURL,
  ContainerURL,
  ServiceURL,
  StorageURL,
  SharedKeyCredential,
  uploadStreamToBlockBlob,
  downloadBlobToBuffer
} = require("@azure/storage-blob");

/* eslint-disable no-unused-vars */
module.exports = {
  provider: 'azure',
  name: 'Azure Storage Service',
  auth: {
    account: {
      label: 'Account name',
      type: 'text'
    },
    accountKey: {
      label: 'Secret Access Key',
      type: 'text'
    },
    containerName: {
      label: 'The name of the blob container',
      type: 'text'
    },
    privateContainerName: {
      label: 'The name of the blob container to use for private files',
      type: 'text'
    },
    defaultPath: {
      label: 'The path to use when there is none being specified.',
      type: 'text'
    },
    maxConcurent: {
      label: 'The maximum concurent uploads to Azure',
      type: 'number'
    },
  },
  init: (config) => {
    const sharedKeyCredential = new SharedKeyCredential(config.account, config.accountKey);
    const pipeline = StorageURL.newPipeline(sharedKeyCredential);
    const serviceURL = new ServiceURL(
      `https://${config.account}.blob.core.chinacloudapi.cn`,
      pipeline
    );

    const containerURL = ContainerURL.fromServiceURL(serviceURL, config.containerName),
      privateContainerUrl = ContainerURL.fromServiceURL(serviceURL, config.privateContainerName);

    return {
      upload: (file) => {
        return new Promise((resolve, reject) => {
          function process(file) {
            var fileName = file.hash + file.ext;
            var containerWithPath = Object.assign({}, (file.isPrivate ? privateContainerUrl : containerURL));
            if (file.path) containerWithPath.url += '/' + file.path;
            else if (config.defaultPath) containerWithPath.url += '/' + config.defaultPath;

            var blobURL = BlobURL.fromContainerURL(containerWithPath, fileName);
            var blockBlobURL = BlockBlobURL.fromBlobURL(blobURL);

            file.url = config.cdnName ? blobURL.url.replace(serviceURL.url, config.cdnName) : blobURL.url;

            return uploadStreamToBlockBlob(
              Aborter.timeout(60 * 60 * 1000),
              new BufferStream(file.buffer),
              blockBlobURL,
              4 * 1024 * 1024, // 4MB block size
              ~~(config.maxConcurent) || 20, // 20 concurrency
              {
                blobHTTPHeaders: {
                  blobContentType: file.mime
                }
              }
            )
              .then(resolve, reject);
          }

          return process(file);
        });
      },
      delete: (file) => {
        return new Promise((resolve, reject) => {
          var _temp = file.url
            .replace(config.cdnName, serviceURL.url)
            .replace((file.isPrivate ? privateContainerUrl.url : containerURL.url), '');

          var pathParts = _temp.split('/').filter(x => x.length > 0);

          var fileName = pathParts.splice(pathParts.length - 1, 1);
          var containerWithPath = (file.isPrivate ? privateContainerUrl : containerURL);
          containerWithPath.url += '/' + pathParts.join('/');

          var blobURL = BlobURL.fromContainerURL(containerWithPath, fileName);
          var blockBlobURL = BlockBlobURL.fromBlobURL(blobURL);

          return blockBlobURL.delete()
            .then(function () {
              resolve()
            }, function (err) {
              return reject(err);
            })
        });
      },
      download: (file) => {
        return new Promise((resolve, reject) => {
          var _temp = file.url
            .replace(config.cdnName, serviceURL.url)
            .replace((file.isPrivate ? privateContainerUrl.url : containerURL.url), '');

          var pathParts = _temp.split('/').filter(x => x.length > 0);

          var fileName = pathParts.splice(pathParts.length - 1, 1);
          var containerWithPath = (file.isPrivate ? privateContainerUrl : containerURL);
          containerWithPath.url += '/' + pathParts.join('/');

          var blobURL = BlobURL.fromContainerURL(containerWithPath, fileName);
          var blockBlobURL = BlockBlobURL.fromBlobURL(blobURL);

          var result = Buffer.alloc(file.size);

          return downloadBlobToBuffer(
            Aborter.timeout(60 * 60 * 1000),
            result,
            blockBlobURL,
            0,
            result.size,
          )
            .then(function () {
              resolve(result);
            }, reject);
        });
      }
    };
  }
};
