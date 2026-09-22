class ImageQueue {
  constructor() {
    this.queue = [];
    this.waitingResolvers = [];
    this.closed = false;
  }

  add(item) {
    if (this.closed) {
      throw new Error(
        "Cannot add item to a closed queue."
      );
    }

    if (this.waitingResolvers.length > 0) {
      const resolve =
        this.waitingResolvers.shift();

      resolve(item);
      return;
    }

    this.queue.push(item);
  }

  async get() {
    if (this.queue.length > 0) {
      return this.queue.shift();
    }

    if (this.closed) {
      return null;
    }

    return new Promise((resolve) => {
      this.waitingResolvers.push(
        resolve
      );
    });
  }

  close() {
    this.closed = true;

    while (
      this.waitingResolvers.length > 0
    ) {
      const resolve =
        this.waitingResolvers.shift();

      resolve(null);
    }
  }

  get size() {
    return this.queue.length;
  }
}

module.exports = {
  ImageQueue,
};