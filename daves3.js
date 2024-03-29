var myProductName = "daves3", myVersion = "0.4.11";  

/*  The MIT License (MIT)
	Copyright (c) 2014-2023 Dave Winer
	
	Permission is hereby granted, free of charge, to any person obtaining a copy
	of this software and associated documentation files (the "Software"), to deal
	in the Software without restriction, including without limitation the rights
	to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	copies of the Software, and to permit persons to whom the Software is
	furnished to do so, subject to the following conditions:
	
	The above copyright notice and this permission notice shall be included in all
	copies or substantial portions of the Software.
	
	THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
	AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
	SOFTWARE.
	*/

exports.stats = s3stats;
exports.defaultType = s3defaultType;
exports.defaultAcl = s3defaultAcl;
exports.splitPath = s3SplitPath;
exports.newObject = s3NewObject;
exports.redirect = s3Redirect;
exports.getObjectMetadata = s3GetObjectMetadata;
exports.getObject = s3GetObject;
exports.listObjects = s3ListObjects;
exports.deleteObject = s3DeleteObject; //8/28/17 by DW
exports.uploadBigFile = s3UploadBigFile; //9/14/17 by DW
exports.folderExists = s3FolderExists; //6/5/18 by DW

require ("aws-sdk/lib/maintenance_mode_message").suppress = true; //3/22/23 by DW

const AWS = require ("aws-sdk");
const s3 = new AWS.S3 ();
const fs = require ("fs");

 
var s3defaultType = "text/plain";
var s3defaultAcl = "public-read";

var s3stats = {
	ctReads: 0, ctBytesRead: 0, ctReadErrors: 0, 
	ctWrites: 0, ctBytesWritten: 0, ctWriteErrors: 0
	};

function stringLower (s) { //6/5/18 by DW
	if (s === undefined) { //1/26/15 by DW
		return ("");
		}
	s = s.toString (); //1/26/15 by DW
	return (s.toLowerCase ());
	}
function beginsWith (s, possibleBeginning, flUnicase) { //6/5/18 by DW
	if (s === undefined) { //7/15/15 by DW
		return (false);
		}
	if (s.length == 0) { //1/1/14 by DW
		return (false);
		}
	if (flUnicase === undefined) {
		flUnicase = true;
		}
	if (flUnicase) {
		for (var i = 0; i < possibleBeginning.length; i++) {
			if (stringLower (s [i]) != stringLower (possibleBeginning [i])) {
				return (false);
				}
			}
		}
	else {
		for (var i = 0; i < possibleBeginning.length; i++) {
			if (s [i] != possibleBeginning [i]) {
				return (false);
				}
			}
		}
	return (true);
	}
function s3SplitPath (path) { //split path like this: /tmp.scripting.com/testing/one.txt -- into bucketname and path.
	var bucketname = "";
	if (path.length > 0) {
		if (path [0] == "/") { //delete the slash
			path = path.substr (1); 
			}
		var ix = path.indexOf ("/");
		bucketname = path.substr (0, ix);
		path = path.substr (ix + 1);
		}
	return ({Bucket: bucketname, Key: path});
	}
function s3NewObject (path, data, type, acl, callback, metadata) {
	var splitpath = s3SplitPath (path);
	if (type === undefined) {
		type = s3defaultType;
		}
	if (acl === undefined) {
		acl = s3defaultAcl;
		}
	var params = {
		ACL: acl,
		ContentType: type,
		Body: data,
		Bucket: splitpath.Bucket,
		Key: splitpath.Key,
		Metadata: metadata
		};
	s3.putObject (params, function (err, data) { 
		if (err) {
			console.log ("s3NewObject: error == " + err.message);
			s3stats.ctWriteErrors++;
			if (callback != undefined) {
				callback (err, data);
				}
			}
		else {
			s3stats.ctWrites++;
			s3stats.ctBytesWritten += params.Body.length;
			if (callback != undefined) {
				callback (err, data);
				}
			}
		});
	}
function s3Redirect (path, url) { //1/30/14 by DW -- doesn't appear to work -- don't know why
	var splitpath = s3SplitPath (path);
	var params = {
		WebsiteRedirectLocation: url,
		Bucket: splitpath.Bucket,
		Key: splitpath.Key,
		Body: " "
		};
	s3.putObject (params, function (err, data) { 
		if (err != null) {
			console.log ("s3Redirect: err.message = " + err.message + ".");
			}
		else {
			console.log ("s3Redirect: path = " + path + ", url = " + url + ", data = ", JSON.stringify (data));
			}
		});
	}
function s3GetObjectMetadata (path, callback, flFixedCallbackParams=false) {
	var params = s3SplitPath (path);
	s3.headObject (params, function (err, data) {
		if (flFixedCallbackParams) {
			callback (err, data);
			}
		else {
			callback (data);
			}
		});
	}
function s3GetObject (path, callback) {
	var params = s3SplitPath (path);
	s3.getObject (params, function (err, data) {
		if (err) {
			s3stats.ctReadErrors++;
			}
		else {
			s3stats.ctReads++;
			s3stats.ctBytesRead += data.Body.length;
			}
		callback (err, data);
		});
	}
function s3ListObjects (path, callback) {
	var splitpath = s3SplitPath (path);
	function getNextGroup (marker) {
		var params = {Bucket: splitpath.Bucket, Prefix: splitpath.Key};
		if (marker != undefined) {
			params = {Bucket: splitpath.Bucket, Prefix: splitpath.Key, Marker: marker};
			}
		s3.listObjects (params, function (err, data) {
			if (err) {
				console.log ("s3ListObjects: error == " + err.message);
				}
			else {
				var lastobj = data.Contents [data.Contents.length - 1];
				for (var i = 0; i < data.Contents.length; i++) {
					data.Contents [i].s3path = splitpath.Bucket + "/" + data.Contents [i].Key; //5/22/14 by DW
					callback (data.Contents [i]);
					}
				if (data.IsTruncated) {
					getNextGroup (lastobj.Key);
					}
				else {
					var obj = new Object ();
					obj.flLastObject = true;
					callback (obj);
					}
				}
			});
		}
	getNextGroup ();
	}
function s3DeleteObject (path, callback) { //8/28/17 by DW
	var splitpath = s3SplitPath (path);
	var params = {
		Bucket: splitpath.Bucket,
		Key: splitpath.Key
		};
	s3.deleteObject (params, function (err) { 
		if (err) {
			console.log ("s3DeleteObject: err.message == " + err.message);
			if (callback !== undefined) {
				callback (err);
				}
			}
		else {
			if (callback !== undefined) {
				callback (undefined);
				}
			}
		});
	}
function s3UploadBigFile (f, s3path, type, acl, callback) {
	let theStream = fs.createReadStream (f);
	let splitpath = s3SplitPath (s3path);
	
	if (acl === undefined) {
		acl = s3defaultAcl;
		}
	
	let myParams = {
		Bucket: splitpath.Bucket,
		Key: splitpath.Key,
		ContentType: type, 
		ACL: acl
		};
	
	let s3obj = new AWS.S3 ({params: myParams});
	s3obj.upload ({Body: theStream}, function (err, data) {
		if (err) {
			if (callback !== undefined) {
				callback (err);
				}
			}
		else {
			if (callback !== undefined) {
				callback (undefined, data);
				}
			}
		});
	}
function s3FolderExists (s3path, callback) { //6/5/18 by DW
	var flHaveCalledBack = false;
	var splitpath = s3SplitPath (s3path);
	var pathToLookFor = splitpath.Key + "/";
	s3ListObjects (s3path, function (obj) {
		if (obj.flLastObject === undefined) {
			if (beginsWith (obj.Key, pathToLookFor)) {
				if (!flHaveCalledBack) {
					callback (true);
					flHaveCalledBack = true;
					}
				}
			}
		else {
			if (!flHaveCalledBack) {
				callback (false);
				flHaveCalledBack = true;
				}
			}
		});
	}

