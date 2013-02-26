/*
 * Copyright 2013 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */


/** NOP afunc. **/
function anop(ret) { ret && ret(undefined); }


/** afunc log. **/
function alog() {
  var args = arguments;
  return function (ret) {
    console.log.apply(console, args);
    ret && ret.apply(this, [].shift.call(arguments));
  };
}


/** Create an afunc which always returns the supplied constant value. **/
function aconstant(v) { return function(ret) { ret && ret(v); } }


/** Execute the supplied afunc N times. **/
function arepeat(n, afunc) {
  return function(ret) {
    var a = argsToArray(arguments);

    var g = function() {
      if ( n-- == 1 ) { a[0] = ret; afunc.apply(this, a); return; };
      afunc.apply(this, a);
    };

    a[0] = g;
    g.apply(this, a);
  };
}

/** Time an afunc. **/
function atime(str, afunc) {
  return function(ret) {
    console.time(str);
    var a = arguments;
    var args = [function() {
      console.timeEnd(str);
      ret && ret.apply(this, [].shift.call(a));
    }];
    for ( var i = 1 ; i < a.length ; i++ ) args[i] = a[i];
    afunc.apply(this, args);
  };
}


/** Sleep for the specified delay. **/
function asleep(ms) {
  return function(ret) {
    var args = [].shift.call(arguments);
    window.setTimeout(ret.bind(args), ms);
  }
}


/** Create a future value. **/
function afuture() {
  var set     = false;
  var values  = undefined;
  var waiters = [];

  return {
    set: function() {
      values = arguments;
      set = true;
      for (var i = 0 ; i < waiters.length; i++) {
        waiters[i].apply(null, values);
      }
      waiters = undefined;
    },

    get: function(ret) {
      if ( set ) { ret.apply(null, values); return; }
      waiters.push(ret);
    }
  };
};


/** Memoize an async function. **/
function amemo(f) {
  var values;
  var waiters;

  return function(ret) {
    if ( values ) { ret.apply(null, values); return; }

    var first = ! waiters;

    if ( first ) waiters = [];

    waiters.push(ret);

    if ( first ) {
      f(function() {
	values = arguments;
	for (var i = 0 ; i < waiters.length; i++) {
	  waiters[i].apply(null, values);
	}
        waiters = [];
      });
    }
  };
}


/** Async Compose (like Function.prototype.O, but for async functions **/
Function.prototype.ao = function(f2) {
  var f1 = this;
  return function() {
    var args = Array.prototype.splice.call(arguments, 0);
    args.unshift(f1);
    f2.apply(null, args);
  };
};

Function.prototype.aseq = function(f2) {
  return f2.ao(this);
};


/** Compose a variable number of async functions. **/
function ao(/* ... afuncs */) {
  var ret = arguments[arguments.length-1];

  for ( var i = 0 ; i < arguments.length-1 ; i++ ) {
    ret = arguments[i].ao(ret);
  }

  return ret;
}


/** Compose a variable number of async functions. **/
function aseq(/* ... afuncs */) {
  var f = arguments[arguments.length-1];

  for ( var i = arguments.length-2 ; i >= 0 ; i-- ) {
    f = arguments[i].aseq(f);
  }

  return f;
}


/**
 * Create a function which executes several afunc's in parallel and passes
 * their joined return values to an optional afunc.
 *
 * Usage: apar(f1,f2,f3)(opt_afunc, opt_args)
 * @param opt_afunc called with joined results after all afuncs finish
 * @param opt_args passed to all afuncs
 **/
function apar(/* ... afuncs */) {
  var aargs = [];
  var count = 0;
  var fs = arguments;

  return function(ret /* opt_args */) {
    var opt_args = Array.prototype.splice.call(arguments, 1);
    var join = function (i) {
      aargs[i] = Array.prototype.splice.call(arguments, 1);
      if ( ++count == fs.length ) {
        var a = [];
        for ( var j = 0 ; j < fs.length ; j++ )
          for ( var k = 0 ; k < aargs[j].length ; k++ )
            a.push(aargs[j][k]);
        ret && ret.apply(null, a);
      }
    };

    for ( var i = 0 ; i < fs.length ; i++ )
      fs[i].apply(null, [join.bind(null, i)].concat(opt_args));
  };
}

/*
var f1 = amemo(function(ret) { console.log('f1'); ret(1); });
var f2 = function(ret, a) { console.log('f2'); ret(a,2); };
var f3 = function(a, b) { console.log(a,b); };
var f4 = console.log.bind(console);

console.log('test1');
f1.aseq(f2.aseq(f4))();

console.log('test2');
f1.aseq(f2.aseq(f4))();

console.log('test3');
f1.aseq(f4)();

console.log('test4');
ao(f4,f2,f1)();

console.log('test5');
aseq(f1, f4)();

console.log('test6');
aseq(f1,f2,f4)();

console.log('test7');
aseq(
  function(ret) { console.log('fB'); ret(1); },
  function(ret) { console.log('fC'); ret(2); },
  f4
)();

console.log('test8');
apar(
  function(ret, a) { console.log('fB'); ret(1); },
  function(ret, a) { console.log('fC'); ret(2); }
)(f4);

console.log('test9');
aseq(
  function(ret) { console.log('fA'); ret(1); },
  apar(
    function(ret, a) { console.log('fB', a); ret(1); },
    function(ret, a) { console.log('fC', a); ret(2); }
  ),
  f4
)();

*/